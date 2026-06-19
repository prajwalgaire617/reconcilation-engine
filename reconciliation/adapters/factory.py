"""
Adapter Factory — single place to wire concrete implementations.
Services call AdapterFactory.payment_gateway() and get the right adapter
regardless of environment (prod NCHL / dev mock / test stub).
"""
from django.conf import settings
from .base import PaymentGatewayPort, ConfirmationSystemPort, ReconciliationLogPort


class AdapterFactory:
    """
    Factory that returns adapter singletons based on Django settings.
    Setting PAYMENT_GATEWAY_TYPE controls which gateway is used.
    """

    _payment_gateway:   PaymentGatewayPort    = None
    _confirmation_sys:  ConfirmationSystemPort = None
    _logger:            ReconciliationLogPort  = None

    # ── Payment Gateway ───────────────────────────────────────────────────────

    @classmethod
    def payment_gateway(cls) -> PaymentGatewayPort:
        if cls._payment_gateway is None:
            gw_type = getattr(settings, "PAYMENT_GATEWAY_TYPE", "NCHL_MOCK")
            cls._payment_gateway = cls._build_gateway(gw_type)
        return cls._payment_gateway

    @classmethod
    def _build_gateway(cls, gw_type: str) -> PaymentGatewayPort:
        if gw_type in ("NCHL_MOCK", "NCHL"):
            from .nchl_adapter import NCHLGatewayAdapter
            return NCHLGatewayAdapter()
        raise ValueError(f"Unknown PAYMENT_GATEWAY_TYPE: {gw_type!r}. Valid: NCHL_MOCK")

    # ── Confirmation System ───────────────────────────────────────────────────

    @classmethod
    def confirmation_system(cls) -> ConfirmationSystemPort:
        if cls._confirmation_sys is None:
            cs_type = getattr(settings, "CONFIRMATION_SYSTEM_TYPE", "SOSYS")
            cls._confirmation_sys = cls._build_confirmation(cs_type)
        return cls._confirmation_sys

    @classmethod
    def _build_confirmation(cls, cs_type: str) -> ConfirmationSystemPort:
        if cs_type == "SOSYS":
            from .sosys_adapter import SOSYSAdapter
            return SOSYSAdapter()
        raise ValueError(f"Unknown CONFIRMATION_SYSTEM_TYPE: {cs_type!r}")

    # ── Logger ────────────────────────────────────────────────────────────────

    @classmethod
    def logger(cls) -> ReconciliationLogPort:
        if cls._logger is None:
            from .logging_adapter import LoggerFactory
            cls._logger = LoggerFactory.get("django")
        return cls._logger

    # ── Test helpers ──────────────────────────────────────────────────────────

    @classmethod
    def override(cls, *, gateway=None, confirmation=None, logger=None):
        """Inject stubs in tests without touching settings."""
        if gateway:    cls._payment_gateway  = gateway
        if confirmation: cls._confirmation_sys = confirmation
        if logger:     cls._logger           = logger

    @classmethod
    def reset(cls):
        cls._payment_gateway = cls._confirmation_sys = cls._logger = None
