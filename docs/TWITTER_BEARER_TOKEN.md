# Generate Twitter Bearer Token

You have:
- **API Key**: `AcZkDB13tIqNMxRRmqaNYe1sa`
- **API Secret**: `GgK16nN8bMbNqiM9miRHLvvKvX3R3dkACgA06IQieVcPJUno9m`

## Quick Method: Developer Portal

1. Go to: https://developer.twitter.com/en/portal/dashboard
2. Select your app
3. Navigate to "Keys and tokens" tab
4. Under "Bearer Token", click "Generate"
5. Copy the token (starts with `AAAA`)

## Alternative: Generate via cURL

```bash
# Base64 encode your credentials
CREDENTIALS=$(echo -n "AcZkDB13tIqNMxRRmqaNYe1sa:GgK16nN8bMbNqiM9miRHLvvKvX3R3dkACgA06IQieVcPJUno9m" | base64)

# Get Bearer Token
curl -X POST 'https://api.twitter.com/oauth2/token' \
  -H "Authorization: Basic $CREDENTIALS" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'grant_type=client_credentials'
```

Response:
```json
{
  "token_type": "bearer",
  "access_token": "AAAAAAAAAAAAAAAAAAAAAAAAA..."
}
```

The `access_token` is your Bearer Token!

## Add to Railway

In Railway Dashboard → Your Project → Variables:

```
TWITTER_API_KEY=AcZkDB13tIqNMxRRmqaNYe1sa
TWITTER_API_SECRET=GgK16nN8bMbNqiM9miRHLvvKvX3R3dkACgA06IQieVcPJUno9m
TWITTER_BEARER_TOKEN=<paste_your_bearer_token_here>
```

Then redeploy!

## Test

```
/partnerbot test-twitter harris_s
```

