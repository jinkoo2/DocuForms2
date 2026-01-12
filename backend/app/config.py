from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGO_URI: str
    DB_NAME: str
    MAX_UPLOAD_SIZE: int = 1073741824  # Default: 1GB in bytes

    class Config:
        env_file = ".env"


settings = Settings()
