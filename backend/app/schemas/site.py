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
