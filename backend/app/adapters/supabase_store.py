"""Supabase storage adapter export kept separate from the local fallback."""

from .local_store import SupabaseStore

__all__ = ["SupabaseStore"]
