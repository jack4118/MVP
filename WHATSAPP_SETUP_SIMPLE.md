# WhatsApp Setup (Super Simple)

This is the fastest setup flow for non-technical users.

## What you need

1. A Meta Developer account
2. A WhatsApp app in Meta
3. 3 values from Meta API Setup page:
- `Business Account ID`
- `Phone Number ID`
- `Access Token` (temporary or permanent)

## 4-step setup

1. Open Meta Developer Console:  
   `https://developers.facebook.com/apps/`
2. Open your WhatsApp app -> API Setup page.
3. Copy the 3 values above and paste them into your CRM WhatsApp page.
4. Click:
- `Save Connection`
- `Verify Connection`
- `Send Test Message`

## Phone number format

Always include country code, no `+`, no spaces.

Example (Malaysia):
- `60123456789`

## If verify/send fails

1. Regenerate a fresh Access Token in Meta and paste again.
2. Re-check Business Account ID and Phone Number ID.
3. Click `Save Connection` again, then `Verify Connection`.

## Done signal

When setup is successful, you should see:
- Connection status: connected
- A test message delivered in logs/chat view
