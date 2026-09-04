from fastapi import APIRouter

from app.api.v1 import admin, admin_tickets, auth, events, gamification, lessons, notifications, reports, sites, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(sites.router)
api_router.include_router(lessons.router)
api_router.include_router(gamification.router)
api_router.include_router(events.router)
api_router.include_router(reports.router)
api_router.include_router(notifications.router)
api_router.include_router(admin.router)
api_router.include_router(admin_tickets.router)
