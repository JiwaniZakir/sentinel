/**
 * Podcast Transcription & Analysis Service
 * 
 * Transcribes podcast episodes using Whisper API and analyzes content
 * to extract investment thesis, expertise, deals mentioned, and quotes.
 * 
 * NOTE: This is opt-in. Set PODCAST_ANALYSIS_ENABLED=true to activate.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const config = require('../../config');
const { logger } = require('../../utils/logger');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// Temp directory for audio downloads
const TEMP_DIR = path.join(__dirname, '../../../temp/audio');

// Supported podcast platforms
const PODCAST_PLATFORMS = {
  'spotify.com': { type: 'spotify', extractable: false }, // Requires Spotify API
  'anchor.fm': { type: 'anchor', extractable: false },
  'podcasts.apple.com': { type: 'apple', extractable: false },
  'youtube.com': { type: 'youtube', extractable: true },  // Can use yt-dlp
  'soundcloud.com': { type: 'soundcloud', extractable: true },
  'castbox.fm': { type: 'castbox', extractable: false },
  'overcast.fm': { type: 'overcast', extractable: false },
};

/**
 * Check if podcast URL is supported
 */
function isSupportedPodcastUrl(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    for (const platform of Object.keys(PODCAST_PLATFORMS)) {
      if (domain.includes(platform)) {
        return PODCAST_PLATFORMS[platform];
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if podcast analysis is enabled
 */
function isEnabled() {
  return config.podcast?.enabled === true;
}

/**
 * Download audio from YouTube URL using yt-dlp
 * (Requires yt-dlp to be installed: pip install yt-dlp)
 */
async function downloadYouTubeAudio(url, outputPath) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '-x', // Extract audio
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputPath,
      url,
    ]);
    
    let stderr = '';
    
    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('yt-dlp:', data.toString());
    });
    
    ytdlp.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, path: outputPath + '.mp3' });
      } else {
        reject(new Error(`yt-dlp failed: ${stderr}`));
      }
    });
    
    ytdlp.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Transcribe audio file using Whisper API
 */
async function transcribeAudio(audioFilePath) {
  console.log('=== TRANSCRIBING AUDIO ===');
  console.log('File:', audioFilePath);
  
  try {
    // Check file size (Whisper has 25MB limit)
    const stats = await fs.stat(audioFilePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log('File size:', fileSizeMB.toFixed(2), 'MB');
    
    if (fileSizeMB > 25) {
      return {
        success: false,
        error: 'Audio file too large (> 25MB)',
        error_type: 'FILE_TOO_LARGE',
      };
    }
    
    // Create read stream
    const audioStream = await fs.readFile(audioFilePath);
    
    // Transcribe with Whisper
    const response = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });
    
    console.log('Transcription complete');
    console.log('Duration:', response.duration, 'seconds');
    console.log('Language:', response.language);
    
    return {
      success: true,
      transcription: response.text,
      duration: response.duration,
      language: response.language,
      segments: response.segments || [],
    };
    
  } catch (error) {
    console.error('Transcription error:', error.message);
    return {
      success: false,
      error: error.message,
      error_type: 'TRANSCRIPTION_ERROR',
    };
  }
}

/**
 * Analyze podcast transcript with AI
 */
async function analyzeTranscript(transcript, context = {}) {
  console.log('=== ANALYZING TRANSCRIPT ===');
  console.log('Transcript length:', transcript.length, 'chars');
  
  const { name, firm, role } = context;
  
  const systemPrompt = `You are analyzing a podcast transcript to extract key insights about a venture capital professional or entrepreneur.

Extract and structure the following information:
1. Main topics discussed (with time estimates)
2. Investment thesis or professional philosophy
3. Specific companies/deals mentioned
4. Expertise areas demonstrated
5. Notable quotes (direct quotes only)
6. Questions they were asked (shows what they're known for)
7. Personal stories or anecdotes
8. Forward-looking predictions or trends mentioned

Be specific and cite actual statements from the transcript.`;

  const userPrompt = `Analyze this podcast transcript featuring ${name || 'the guest'}${firm ? ` from ${firm}` : ''}:

${transcript.substring(0, 15000)} ${transcript.length > 15000 ? '...[transcript truncated]' : ''}

Provide a structured analysis with specific quotes and details.`;

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });
    
    const analysis = response.choices[0].message.content;
    
    // Parse the analysis (could be more structured)
    const parsed = parseAnalysis(analysis);
    
    console.log('Analysis complete');
    
    return {
      success: true,
      rawAnalysis: analysis,
      structured: parsed,
    };
    
  } catch (error) {
    console.error('Analysis error:', error.message);
    return {
      success: false,
      error: error.message,
      error_type: 'ANALYSIS_ERROR',
    };
  }
}

/**
 * Parse AI analysis into structured format
 */
function parseAnalysis(analysis) {
  const parsed = {
    topics: [],
    thesis: null,
    deals: [],
    expertise: [],
    quotes: [],
    questions: [],
    stories: [],
    predictions: [],
  };
  
  // Simple section parsing (could be enhanced)
  const sections = analysis.split(/\n\n|\n(?=\d+\.|•|-)/).filter(Boolean);
  
  for (const section of sections) {
    const sectionLower = section.toLowerCase();
    
    if (sectionLower.includes('topic') || sectionLower.includes('discussed')) {
      parsed.topics.push(section.trim());
    } else if (sectionLower.includes('thesis') || sectionLower.includes('philosophy')) {
      parsed.thesis = section.trim();
    } else if (sectionLower.includes('compan') || sectionLower.includes('deal') || sectionLower.includes('investment')) {
      parsed.deals.push(section.trim());
    } else if (sectionLower.includes('expertise') || sectionLower.includes('expert')) {
      parsed.expertise.push(section.trim());
    } else if (sectionLower.includes('quote') || section.includes('"')) {
      // Extract quotes
      const quotes = section.match(/"([^"]+)"/g);
      if (quotes) parsed.quotes.push(...quotes);
    } else if (sectionLower.includes('question') || sectionLower.includes('asked')) {
      parsed.questions.push(section.trim());
    } else if (sectionLower.includes('story') || sectionLower.includes('anecdote')) {
      parsed.stories.push(section.trim());
    } else if (sectionLower.includes('predict') || sectionLower.includes('trend') || sectionLower.includes('future')) {
      parsed.predictions.push(section.trim());
    }
  }
  
  return parsed;
}

/**
 * Process a podcast URL (main entry point)
 */
async function processPodcast(url, context = {}) {
  console.log('=== PODCAST PROCESSING ===');
  console.log('URL:', url);
  
  if (!isEnabled()) {
    console.log('Podcast analysis is disabled');
    return {
      success: false,
      error: 'Podcast analysis is disabled. Set PODCAST_ANALYSIS_ENABLED=true to enable.',
      error_type: 'DISABLED',
    };
  }
  
  // Check if platform is supported
  const platform = isSupportedPodcastUrl(url);
  if (!platform) {
    return {
      success: false,
      error: 'Unsupported podcast platform',
      error_type: 'UNSUPPORTED_PLATFORM',
    };
  }
  
  if (!platform.extractable) {
    return {
      success: false,
      error: `${platform.type} requires specific API (not implemented yet)`,
      error_type: 'PLATFORM_NOT_IMPLEMENTED',
    };
  }
  
  // Create temp directory
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (e) {
    // Directory exists
  }
  
  const tempFile = path.join(TEMP_DIR, `podcast_${crypto.randomBytes(8).toString('hex')}`);
  
  try {
    // Step 1: Download audio
    console.log('Step 1: Downloading audio...');
    let audioPath;
    
    if (platform.type === 'youtube') {
      const downloadResult = await downloadYouTubeAudio(url, tempFile);
      if (!downloadResult.success) {
        throw new Error('Audio download failed');
      }
      audioPath = downloadResult.path;
    } else {
      throw new Error('Platform not implemented');
    }
    
    // Step 2: Transcribe
    console.log('Step 2: Transcribing audio...');
    const transcriptResult = await transcribeAudio(audioPath);
    
    if (!transcriptResult.success) {
      throw new Error(`Transcription failed: ${transcriptResult.error}`);
    }
    
    // Step 3: Analyze with AI
    console.log('Step 3: Analyzing transcript...');
    const analysisResult = await analyzeTranscript(transcriptResult.transcription, context);
    
    if (!analysisResult.success) {
      throw new Error(`Analysis failed: ${analysisResult.error}`);
    }
    
    // Clean up temp file
    try {
      await fs.unlink(audioPath);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    console.log('Podcast processing complete');
    
    return {
      success: true,
      source: 'podcast',
      researchType: 'PODCAST_ANALYSIS',
      url,
      platform: platform.type,
      data: {
        url,
        duration: transcriptResult.duration,
        language: transcriptResult.language,
        transcription: transcriptResult.transcription,
        analysis: analysisResult.structured,
        rawAnalysis: analysisResult.rawAnalysis,
      },
      costs: {
        transcription: (transcriptResult.duration / 60 * 0.006).toFixed(3),
        analysis: 0.10, // Approximate
        total: ((transcriptResult.duration / 60 * 0.006) + 0.10).toFixed(3),
      },
      processedAt: new Date().toISOString(),
    };
    
  } catch (error) {
    console.error('Podcast processing error:', error.message);
    
    // Clean up temp file if exists
    try {
      await fs.unlink(tempFile);
      await fs.unlink(tempFile + '.mp3');
    } catch (e) {
      // Ignore cleanup errors
    }
    
    return {
      success: false,
      error: error.message,
      error_type: 'PROCESSING_ERROR',
    };
  }
}

/**
 * Process multiple podcasts with rate limiting
 */
async function processPodcasts(urls, context = {}, options = {}) {
  const { maxPodcasts = 3, delayMs = 5000 } = options;
  
  console.log(`=== BATCH PODCAST PROCESSING ===`);
  console.log(`URLs: ${urls.length}, Max: ${maxPodcasts}`);
  
  if (!isEnabled()) {
    console.log('Podcast analysis is disabled');
    return [];
  }
  
  const results = [];
  const validUrls = urls.slice(0, maxPodcasts); // Limit number of podcasts
  
  // Process sequentially (transcription takes time)
  for (const url of validUrls) {
    const result = await processPodcast(url, context);
    results.push(result);
    
    // Delay between podcasts
    if (validUrls.indexOf(url) < validUrls.length - 1) {
      console.log(`Waiting ${delayMs}ms before next podcast...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  const successful = results.filter(r => r.success);
  const totalCost = successful.reduce((sum, r) => sum + parseFloat(r.costs?.total || 0), 0);
  
  console.log(`Podcast processing complete: ${successful.length}/${results.length} successful`);
  console.log(`Total cost: $${totalCost.toFixed(2)}`);
  
  return results;
}

/**
 * Extract podcast URLs from research results
 */
function extractPodcastUrls(researchResults) {
  const urls = new Set();
  
  // From Tavily social profiles
  if (researchResults.socialProfiles?.data?.profiles?.podcast) {
    urls.add(researchResults.socialProfiles.data.profiles.podcast.url);
  }
  
  // From Perplexity citations
  if (researchResults.personNews?.data?.citations) {
    for (const citation of researchResults.personNews.data.citations) {
      if (typeof citation === 'string' && isSupportedPodcastUrl(citation)) {
        urls.add(citation);
      }
    }
  }
  
  // From Perplexity podcasts field
  if (researchResults.personNews?.data?.podcasts) {
    const podcastsText = researchResults.personNews.data.podcasts;
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
    const matches = podcastsText.match(urlPattern) || [];
    for (const match of matches) {
      if (isSupportedPodcastUrl(match)) {
        urls.add(match);
      }
    }
  }
  
  return Array.from(urls);
}

/**
 * Generate summary for AI context
 */
function generatePodcastSummary(podcastData) {
  if (!podcastData?.success || !podcastData.data) {
    return null;
  }
  
  const { analysis } = podcastData.data;
  
  let summary = `### Podcast Appearance:\n`;
  summary += `🎙️ **URL**: ${podcastData.url}\n`;
  summary += `⏱️ **Duration**: ${(podcastData.data.duration / 60).toFixed(0)} minutes\n`;
  summary += `💰 **Cost to analyze**: $${podcastData.costs.total}\n\n`;
  
  if (analysis?.topics?.length > 0) {
    summary += `**Topics Discussed:**\n`;
    analysis.topics.slice(0, 5).forEach(t => {
      summary += `- ${t}\n`;
    });
    summary += '\n';
  }
  
  if (analysis?.thesis) {
    summary += `**Investment Thesis:**\n`;
    summary += `${analysis.thesis}\n\n`;
  }
  
  if (analysis?.deals?.length > 0) {
    summary += `**Deals/Companies Mentioned:**\n`;
    analysis.deals.forEach(d => {
      summary += `- ${d}\n`;
    });
    summary += '\n';
  }
  
  if (analysis?.quotes?.length > 0) {
    summary += `**Notable Quotes:**\n`;
    analysis.quotes.slice(0, 3).forEach(q => {
      summary += `> ${q}\n`;
    });
    summary += '\n';
  }
  
  if (analysis?.expertise?.length > 0) {
    summary += `**Expertise Demonstrated:**\n`;
    analysis.expertise.forEach(e => {
      summary += `- ${e}\n`;
    });
  }
  
  return summary;
}

/**
 * Estimate cost for podcast analysis
 */
function estimateCost(durationMinutes) {
  const transcriptionCost = durationMinutes * 0.006;
  const analysisCost = 0.10; // Approximate GPT-4 cost
  const total = transcriptionCost + analysisCost;
  
  return {
    transcription: transcriptionCost.toFixed(3),
    analysis: analysisCost.toFixed(2),
    total: total.toFixed(2),
  };
}

module.exports = {
  processPodcast,
  processPodcasts,
  extractPodcastUrls,
  transcribeAudio,
  analyzeTranscript,
  generatePodcastSummary,
  isSupportedPodcastUrl,
  isEnabled,
  estimateCost,
  downloadYouTubeAudio,
};

