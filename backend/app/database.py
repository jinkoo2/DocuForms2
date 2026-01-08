from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from app.config import settings

client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.DB_NAME]

forms_collection = db.forms
submissions_collection = db.submissions


def convert_objectid_to_str(doc: dict) -> dict:
    """Convert MongoDB ObjectId fields to strings for JSON serialization."""
    if doc is None:
        return doc
    
    if isinstance(doc, dict):
        result = {}
        for key, value in doc.items():
            if isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, dict):
                result[key] = convert_objectid_to_str(value)
            elif isinstance(value, list):
                result[key] = [convert_objectid_to_str(item) if isinstance(item, dict) else (str(item) if isinstance(item, ObjectId) else item) for item in value]
            else:
                result[key] = value
        return result
    return doc
