# WhatsApp Support Backend

## Setup

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
2. Update `.env` with your PostgreSQL connection string and Meta WhatsApp credentials.

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 5000
```

## API Endpoints

- `GET /webhook` - Webhook verification
- `POST /webhook` - Receive WhatsApp messages
- `GET /api/v1/sessions` - List active sessions
- `GET /api/v1/sessions/{id}/messages` - Get messages for a session
- `POST /api/v1/sessions/{id}/send` - Send a message

## Webhook Setup

In Meta Developers Console:

1. Go to WhatsApp > Configuration.
2. Edit Webhook.
3. Callback URL: `https://your-domain.com/webhook`
4. Verify Token: Match the one in your `.env`.
5. Select fields: `messages`.
