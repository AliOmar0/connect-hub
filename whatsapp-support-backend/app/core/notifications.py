import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)

class NotificationService:
    @staticmethod
    def _send_email_sync(session_id: str, customer_phone: str, reason: str):
        sender_email = os.getenv("SMTP_SENDER_EMAIL")
        sender_password = os.getenv("SMTP_SENDER_PASSWORD")
        receiver_email = os.getenv("SUPPORT_TEAM_EMAIL")
        smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))

        if not sender_email or not sender_password or not receiver_email:
            logger.warning("SMTP Configuration missing. Please set SMTP_SENDER_EMAIL, SMTP_SENDER_PASSWORD, and SUPPORT_TEAM_EMAIL.")
            return

        subject = f"⚠️ WhatsApp Escalation Alert: {customer_phone}"
        body = f"""
        <html>
            <body>
                <h3 style="color: #d9534f;">New Escalation Request</h3>
                <p><strong>Customer:</strong> {customer_phone}</p>
                <p><strong>Session ID:</strong> {session_id}</p>
                <p><strong>Reason:</strong> {reason}</p>
                <p><a href="{os.getenv('DASHBOARD_URL', '#')}">Open Agent Dashboard</a></p>
            </body>
        </html>
        """

        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = receiver_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))

        try:
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(sender_email, sender_password)
                server.send_message(msg)
            logger.info(f"Escalation email sent for session {session_id}")
        except Exception as e:
            logger.error(f"Failed to send email notification: {e}")

    @staticmethod
    async def send_escalation_email(session_id: str, customer_phone: str, reason: str = "Customer requested agent"):
        """
        Send an email notification asynchronously.
        """
        # Run blocking SMTP call in a separate thread to avoid blocking the event loop
        await asyncio.to_thread(NotificationService._send_email_sync, session_id, customer_phone, reason)

notification_service = NotificationService()
