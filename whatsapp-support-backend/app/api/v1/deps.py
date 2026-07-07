from typing import Optional

from app.database import get_supabase
from app.core.config import settings
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt import PyJWKClient
import logging

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

# Algorithms Supabase may sign access tokens with. Legacy projects use a single
# shared HS256 secret (SUPABASE_JWT_SECRET). Projects migrated to the newer
# "Signing keys" system (see https://supabase.com/docs/guides/auth/signing-keys)
# sign with an asymmetric key (ES256 by default, RS256 also supported) whose
# public key is published at the project's JWKS endpoint. We support both so
# this backend keeps working across the migration without code changes.
_ASYMMETRIC_ALGORITHMS = ("ES256", "RS256")

_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> PyJWKClient:
    """Lazily build (and cache) the JWKS client for the configured Supabase
    project. Keys are cached in-memory by PyJWKClient itself (10 min lifespan),
    matching Supabase's own edge cache window, so this doesn't hit the network
    on every request."""
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=600)
    return _jwks_client


async def get_session():
    """
    Dependency to get the supabase client.
    """
    return await get_supabase()


async def verify_jwt(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Verify JWT token from the Authorization header.

    Supports both Supabase signing systems:
    - Legacy: HS256 signed with the shared SUPABASE_JWT_SECRET.
    - Current: ES256/RS256 signed with a project signing key, verified via the
      project's public JWKS endpoint (no shared secret needed).

    Returns the decoded token payload with user data.
    Raises HTTPException 401 if the token is missing, expired, or invalid.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        # Read (unverified) header to decide which verification path to take.
        # This does NOT trust the token yet - jwt.decode below still verifies
        # the signature before any claim is used.
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg", "HS256")

        if alg in _ASYMMETRIC_ALGORITHMS:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=[alg],
                audience="authenticated",
            )
        else:
            if not settings.SUPABASE_JWT_SECRET:
                logger.error("JWT authentication is not configured: SUPABASE_JWT_SECRET is not set")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Authentication is not configured on the server."
                )
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=[settings.JWT_ALGORITHM],
                audience="authenticated",
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
    except jwt.exceptions.PyJWKClientError as e:
        logger.warning(f"Could not resolve signing key from JWKS: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or malformed token."
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