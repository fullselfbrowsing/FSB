from __future__ import annotations

from pydantic import BaseModel


# --- Auth ---

class RegisterResponse(BaseModel):
    hashKey: str
    message: str


class ValidateResponse(BaseModel):
    valid: bool
    createdAt: str | None = None
    error: str | None = None


# --- Generic ---

class ErrorResponse(BaseModel):
    error: str
