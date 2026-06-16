from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.services.modbus_service import (
    read_registers, get_device_status, evaluate_multi_condition_alarm,
    get_alarms, acknowledge_alarm, acknowledge_all_alarms, clear_all_alarms,
    get_alarm_config, update_alarm_config, get_consecutive_trackers
)
from app.models.schemas import MultiConditionAlarmConfig

router = APIRouter()


@router.get("/modbus/devices")
def list_devices():
    return get_device_status()


@router.get("/modbus/read/{device_id}/{address}/{count}")
def read_holding(device_id: str, address: int, count: int = 1):
    """Read holding registers from a Modbus device."""
    return read_registers(device_id, address, count)


@router.post("/modbus/write/{device_id}/{address}")
def write_register(device_id: str, address: int, value: int):
    return {"device_id": device_id, "address": address, "value": value, "status": "written"}


@router.get("/alarm/config")
def get_alarm_configuration():
    """Get multi-condition alarm configuration."""
    return get_alarm_config()


@router.put("/alarm/config")
def update_alarm_configuration(config: MultiConditionAlarmConfig):
    """Update multi-condition alarm configuration."""
    return update_alarm_config(config.dict())


@router.post("/alarm/evaluate")
def evaluate_alarm(
    device_id: str,
    register_name: str,
    value: float
):
    """Evaluate alarm with multi-condition linkage (consecutive exceedance + device online)."""
    result = evaluate_multi_condition_alarm(device_id, register_name, value)
    if result["level"] is None and result["message"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.get("/alarm/list")
def list_alarms(
    level: Optional[str] = Query(None, description="Filter by level: warning/critical/info"),
    acknowledged: Optional[bool] = Query(None, description="Filter by acknowledged status")
):
    """List alarms with optional filters."""
    return get_alarms(level=level, acknowledged=acknowledged)


@router.post("/alarm/acknowledge/{alarm_id}")
def ack_alarm(alarm_id: str):
    """Acknowledge a specific alarm."""
    result = acknowledge_alarm(alarm_id)
    if result["status"] == "not_found":
        raise HTTPException(status_code=404, detail="Alarm not found")
    return result


@router.post("/alarm/acknowledge-all")
def ack_all_alarms():
    """Acknowledge all alarms."""
    return acknowledge_all_alarms()


@router.delete("/alarm/all")
def delete_all_alarms():
    """Clear all alarms and reset consecutive trackers."""
    return clear_all_alarms()


@router.get("/alarm/consecutive-trackers")
def list_consecutive_trackers():
    """Get current consecutive exceedance tracking status."""
    return get_consecutive_trackers()
