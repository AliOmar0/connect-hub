from typing import Optional

from app.database import get_supabase
from app.core.config import settings
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import logging

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


async def get_session():
    """
    Dependency to get the supabase client.
    """
    return await get_supabase()


async def verify_jwt(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Verify JWT token from the Authorization header.
    Shared with Node.js backend - uses the same SUPABASE_JWT_SECRET.
    
    Returns the decoded token payload with user data.
    Raises HTTPException 401 if the token is missing, expired, or invalid.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not settings.SUPABASE_JWT_SECRET:
        logger.error("JWT authentication is not configured: SUPABASE_JWT_SECRET is not set")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured on the server."
        )
    
    token = credentials.credentials
    
    try:
        # Verify the token using the shared secret and algorithm
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        
        # Derive role from payload (mirrors Node.js auth.js logic)
        role_name = (
            payload.get("role_name") or
            payload.get("app_metadata", {}).get("role") or
            payload.get("user_metadata", {}).get("role") or
            "viewer"
        )
        
        # Verify role is in authorized roles list
        if role_name not in settings.JWT_AUTHORIZED_ROLES:
            logger.warning(f"Token has unrecognized role: {role_name}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions."
            )
        
        return {
            "id": payload.get("sub"),
            "email": payload.get("email"),
            "role": role_name,
            "claims": payload
        }
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please log in again."
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or malformed token."
        )


# Optional auth - returns user data if token is present, None if not
async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Optional[dict]:
    """Get user info if token is provided, otherwise return None."""
    if not credentials:
        return None
    try:
        return await verify_jwt(credentials)
    except HTTPException:
        return None