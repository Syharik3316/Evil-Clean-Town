import enum
from datetime import date

from sqlalchemy import Date, Enum, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class LayerType(str, enum.Enum):
    rgb = "rgb"
    ndvi = "ndvi"
    turbidity = "turbidity"


class CoastlineSite(TimestampMixin, Base):
    __tablename__ = "coastline_sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    region: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)

    layers: Mapped[list["SatelliteLayer"]] = relationship(
        back_populates="site", order_by="SatelliteLayer.order_index", cascade="all, delete-orphan"
    )


class SatelliteLayer(Base):
    __tablename__ = "satellite_layers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("coastline_sites.id", ondelete="CASCADE"), nullable=False)
    captured_at: Mapped[date] = mapped_column(Date, nullable=False)
    layer_type: Mapped[LayerType] = mapped_column(Enum(LayerType), default=LayerType.rgb, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    # bounding box for Leaflet ImageOverlay: [[south, west], [north, east]]
    bounds: Mapped[list] = mapped_column(JSON, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    site: Mapped[CoastlineSite] = relationship(back_populates="layers")
