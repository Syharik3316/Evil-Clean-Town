from pydantic import BaseModel, field_validator


class TicketRejectRequest(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def reason_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Укажите причину отклонения")
        return v
