from datetime import date

from pydantic import BaseModel, ConfigDict

from app.models.site import LayerType


class SatelliteLayerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    captured_at: date
    layer_type: LayerType
    label: str
    image_url: str
    bounds: list
    order_index: int


class SatelliteLayerCreate(BaseModel):
    captured_at: date
    layer_type: LayerType = LayerType.rgb
    label: str
    image_url: str
    bounds: list
    order_index: int = 0


class SatelliteLayerUpdate(BaseModel):
    captured_at: date | None = None
    layer_type: LayerType | None = None
    label: str | None = None
    image_url: str | None = None
    bounds: list | None = None
    order_index: int | None = None


class CoastlineSiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    region: str | None
    description: str | None
    lat: float
    lon: float


class CoastlineSiteDetail(CoastlineSiteOut):
    layers: list[SatelliteLayerOut] = []


class CoastlineSiteCreate(BaseModel):
    name: str
    region: str | None = None
    description: str | None = None
    lat: float
    lon: float


class CoastlineSiteUpdate(BaseModel):
    name: str | None = None
    region: str | None = None
    description: str | None = None
    lat: float | None = None
    lon: float | None = None
