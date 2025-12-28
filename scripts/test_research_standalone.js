#!/usr/bin/env node
/**
 * Standalone Research Pipeline Test
 * 
 * Run the full research pipeline on any LinkedIn profile
 * and output results to console.
 * 
 * Usage: node scripts/test_research_standalone.js <linkedin_url> [name] [firm]
 */

require('dotenv').config();
const db = require('../src/services/database');
const research = require('../src/services/research');

async function main() {
  const linkedinUrl = process.argv[2] || 'https://www.linkedin.com/in/bajpainaman/';
  const name = process.argv[3] || null;
  const firm = process.argv[4] || null;
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     FOUNDRY BOT - STANDALONE RESEARCH PIPELINE TEST        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('🔗 LinkedIn URL:', linkedinUrl);
  console.log('👤 Name hint:', name || 'Will extract from LinkedIn');
  console.log('🏢 Firm hint:', firm || 'Will extract from LinkedIn');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  let testPartnerId = null;
  
  try {
    // Create test partner
    console.log('📝 Creating test partner record...');
    const testPartner = await db.partners.create({
      slackUserId: `STANDALONE_TEST_${Date.now()}`,
      name: name || 'Research Test',
      firm: firm || 'Research Test Firm',
      partnerType: 'OTHER',
      linkedinUrl,
      onboardingData: {
        test: true,
        thesis: 'Early-stage startups',
        sectors: ['Technology', 'Software'],
        origin_story: 'Building innovative solutions',
        superpower: 'Technical expertise',
        fun_fact: 'Love solving complex problems',
      },
    });
    testPartnerId = testPartner.id;
    console.log('✅ Test partner created:', testPartnerId);
    console.log('');
    
    // Run full pipeline
    console.log('🚀 Starting Full Research Pipeline...');
    console.log('');
    const startTime = Date.now();
    
    const result = await research.runFullPipeline(testPartnerId, linkedinUrl, {
      name,
      firm,
      partnerType: 'OTHER',
      generateIntro: true,
      crawlCitations: true,
    });
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('🎉 PIPELINE COMPLETE!');
    console.log('⏱️  Total Time:', totalTime + 's');
    console.log('');
    
    // Stage 1: Data Collection
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1️⃣  STAGE 1: DATA COLLECTION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const stage1 = result.stages.dataCollection;
    console.log('⏱️  Duration:', (result.timing.dataCollection / 1000).toFixed(1) + 's');
    console.log('✅ Sources:', stage1?.sourcesUsed?.join(', ') || 'none');
    console.log('❌ Errors:', stage1?.errorsCount || 0);
    console.log('');
    
    // Stage 2: Citation Crawling
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('2️⃣  STAGE 2: CITATION CRAWLING');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const stage2 = result.stages.citationCrawling;
    console.log('⏱️  Duration:', (result.timing.citationCrawling / 1000).toFixed(1) + 's');
    console.log('🔗 Citations found:', stage2?.citationsFound || 0);
    console.log('🌐 Crawled:', stage2?.crawled || 0);
    console.log('✅ Successful:', stage2?.successful || 0);
    console.log('');
    
    // Stage 3: Quality & Fact Checking
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('3️⃣  STAGE 3: QUALITY & FACT CHECKING');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const stage3 = result.stages.qualityChecking;
    console.log('⏱️  Duration:', (result.timing.qualityChecking / 1000).toFixed(1) + 's');
    console.log('📊 Overall Quality:', (stage3?.overallQuality * 100).toFixed(0) + '%');
    console.log('📝 Facts collected:', stage3?.factsCollected || 0);
    console.log('✅ Verified facts:', stage3?.verifiedFacts || 0);
    console.log('⚠️  Disputed facts:', stage3?.disputedFacts || 0);
    console.log('');
    
    // Stage 4: Profile Aggregation
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('4️⃣  STAGE 4: PROFILE AGGREGATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const stage4 = result.stages.profileAggregation;
    console.log('⏱️  Duration:', (result.timing.profileAggregation / 1000).toFixed(1) + 's');
    console.log('👤 PersonProfile:', stage4?.personProfileCreated ? '✅ Created' : '❌ Failed');
    console.log('🏢 FirmProfile:', stage4?.firmProfileCreated ? '✅ Created' : '❌ Failed');
    console.log('📈 Data Quality:', (stage4?.dataQualityScore * 100).toFixed(0) + '%');
    console.log('');
    
    // Fetch the created profiles
    if (stage4?.personProfileCreated) {
      const personProfile = await db.prisma.personProfile.findUnique({
        where: { partnerId: testPartnerId },
      });
      
      if (personProfile) {
        console.log('📋 PersonProfile Details:');
        console.log('   Name:', personProfile.name);
        console.log('   LinkedIn:', personProfile.linkedinUrl);
        console.log('   Location:', personProfile.location || 'N/A');
        console.log('   Headline:', personProfile.headline || 'N/A');
        console.log('   Twitter:', personProfile.twitterUrl || 'N/A');
        console.log('   Education:', personProfile.education ? JSON.stringify(personProfile.education).substring(0, 100) + '...' : 'N/A');
        console.log('   Career Timeline:', personProfile.careerTimeline ? (JSON.parse(JSON.stringify(personProfile.careerTimeline)).length + ' positions') : 'N/A');
        console.log('   Sectors:', personProfile.sectors?.join(', ') || 'N/A');
        console.log('   Interests:', personProfile.interests?.slice(0, 5).join(', ') || 'N/A');
        console.log('   Fun Facts:', personProfile.funFacts?.join('; ') || 'N/A');
        console.log('   Sources Used:', personProfile.sourcesUsed?.join(', ') || 'N/A');
        console.log('');
      }
    }
    
    if (stage4?.firmProfileCreated) {
      const updatedPartner = await db.partners.findById(testPartnerId);
      if (updatedPartner?.firm) {
        const firmProfile = await db.prisma.firmProfile.findUnique({
          where: { name: updatedPartner.firm },
        });
        
        if (firmProfile) {
          console.log('🏢 FirmProfile Details:');
          console.log('   Name:', firmProfile.name);
          console.log('   Type:', firmProfile.type);
          console.log('   Founded:', firmProfile.foundedYear || 'N/A');
          console.log('   HQ:', firmProfile.headquarters || 'N/A');
          console.log('   Website:', firmProfile.website || 'N/A');
          console.log('   Description:', firmProfile.description ? firmProfile.description.substring(0, 150) + '...' : 'N/A');
          console.log('   Portfolio Size:', firmProfile.portfolioSize || 'N/A');
          console.log('   Sectors:', firmProfile.sectorFocus?.join(', ') || 'N/A');
          console.log('   Sources Used:', firmProfile.sourcesUsed?.join(', ') || 'N/A');
          console.log('');
        }
      }
    }
    
    // Stage 5: Introduction Generation
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('5️⃣  STAGE 5: INTRODUCTION GENERATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const stage5 = result.stages.introGeneration;
    const stage5Time = result.timing.introGeneration ? (result.timing.introGeneration / 1000).toFixed(1) : 'N/A';
    console.log('⏱️  Duration:', stage5Time + 's');
    console.log('📝 Generated:', stage5?.generated ? '✅ Yes' : '❌ No');
    console.log('📏 Length:', stage5?.length || 0, 'chars');
    if (stage5?.error) {
      console.log('❌ Error:', stage5.error);
    }
    console.log('');
    
    // Show the introduction
    if (result.introduction) {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('📝 GENERATED INTRODUCTION');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');
      console.log(result.introduction);
      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
    }
    
    // Show errors
    if (result.errors && result.errors.length > 0) {
      console.log('');
      console.log('⚠️  ERRORS ENCOUNTERED:');
      result.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. [${err.source || err.stage}] ${err.error}`);
      });
    }
    
    console.log('');
    console.log('✅ Test complete!');
    console.log('💰 Estimated cost: ~$0.17');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ PIPELINE FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('');
  } finally {
    // Clean up test data
    if (testPartnerId) {
      console.log('🧹 Cleaning up test data...');
      try {
        await db.prisma.personProfile.deleteMany({ where: { partnerId: testPartnerId } });
        await db.prisma.partnerResearch.deleteMany({ where: { partnerId: testPartnerId } });
        await db.prisma.partner.delete({ where: { id: testPartnerId } });
        console.log('✅ Cleanup complete');
      } catch (e) {
        console.log('⚠️  Cleanup error:', e.message);
      }
    }
    
    // Close database connection
    await db.prisma.$disconnect();
    console.log('');
    console.log('Done!');
  }
}

main().catch(console.error);

