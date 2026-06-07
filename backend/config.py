import os
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    # App General Settings
    APP_NAME: str = "OmniBase API"
    DEBUG: bool = True
    
    # Database Settings
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://gowtamsingulur@localhost:5432/omnibase",
        env="DATABASE_URL"
    )
    
    # Redis & Queue Settings
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        env="REDIS_URL"
    )
    
    # Auth (JWT) Settings
    JWT_SECRET: str = Field(
        default="supersecretjwtsecretkeyshouldbechangedinproduction12345",
        env="JWT_SECRET"
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Local & S3 Storage Settings
    UPLOAD_DIR: str = Field(
        default="./uploads",
        env="UPLOAD_DIR"
    )
    AWS_ACCESS_KEY_ID: str = Field(default="", env="AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: str = Field(default="", env="AWS_SECRET_ACCESS_KEY")
    AWS_REGION: str = Field(default="us-east-1", env="AWS_REGION")
    S3_BUCKET_NAME: str = Field(default="", env="S3_BUCKET_NAME")
    
    # AI API Keys
    OPENAI_API_KEY: str = Field(default="", env="OPENAI_API_KEY")
    ANTHROPIC_API_KEY: str = Field(default="", env="ANTHROPIC_API_KEY")
    GEMINI_API_KEY: str = Field(default="", env="GEMINI_API_KEY")
    
    class Config:
        env_file = os.path.join(os.path.dirname(__file__), ".env")
        extra = "ignore"

settings = Settings()

# Ensure local upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
