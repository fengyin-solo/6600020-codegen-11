"""Modbus service with mock data (replace with pymodbus for production)."""
import random
import time
import uuid
from typing import List, Dict, Any, Optional, Tuple

MOCK_DEVICES = [
    {"id": "dev1", "name": "温湿度传感器-A区", "ip": "192.168.1.101", "port": 502, "slave_id": 1, "online": True},
    {"id": "dev2", "name": "压力变送器-B区", "ip": "192.168.1.102", "port": 502, "slave_id": 2, "online": True},
    {"id": "dev3", "name": "电机控制器-C区", "ip": "192.168.1.103", "port": 502, "slave_id": 3, "online": False},
    {"id": "dev4", "name": "流量计-D区", "ip": "192.168.1.104", "port": 502, "slave_id": 4, "online": True},
]

DEFAULT_ALARM_CONFIG: Dict[str, Any] = {
    "require_device_online": True,
    "thresholds": [
        {"register_name": "温度", "warning_threshold": 28, "critical_threshold": 30, "consecutive_count": 3},
        {"register_name": "湿度", "warning_threshold": 70, "critical_threshold": 80, "consecutive_count": 3},
        {"register_name": "管道压力", "warning_threshold": 3.8, "critical_threshold": 4.5, "consecutive_count": 3},
        {"register_name": "电流", "warning_threshold": 15, "critical_threshold": 20, "consecutive_count": 3},
        {"register_name": "瞬时流量", "warning_threshold": 180, "critical_threshold": 220, "consecutive_count": 3},
    ]
}

_consecutive_tracker: Dict[str, Dict[str, Any]] = {}
_alarms: List[Dict[str, Any]] = []


def get_device_status() -> List[Dict[str, Any]]:
    return MOCK_DEVICES


def read_registers(device_id: str, address: int, count: int) -> Dict[str, Any]:
    """Read registers via pymodbus (mock implementation)."""
    values = [round(random.uniform(0, 100), 2) for _ in range(count)]
    return {"device_id": device_id, "address": address, "values": values}


def get_alarm_config() -> Dict[str, Any]:
    return DEFAULT_ALARM_CONFIG


def update_alarm_config(config: Dict[str, Any]) -> Dict[str, Any]:
    global DEFAULT_ALARM_CONFIG
    DEFAULT_ALARM_CONFIG = config
    return DEFAULT_ALARM_CONFIG


def _get_threshold(register_name: str, thresholds: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    for t in thresholds:
        if t["register_name"] == register_name:
            return t
    return None


def evaluate_multi_condition_alarm(
    device_id: str,
    register_name: str,
    value: float,
    config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Evaluate alarm with multi-condition linkage:
    - Consecutive exceedance of threshold
    - Device online status (if required)
    Returns: {level, consecutive_count, escalated, message}
    """
    if config is None:
        config = DEFAULT_ALARM_CONFIG

    device = next((d for d in MOCK_DEVICES if d["id"] == device_id), None)
    if not device:
        return {"level": None, "consecutive_count": 0, "escalated": False, "message": "Device not found"}

    threshold = _get_threshold(register_name, config.get("thresholds", []))
    if not threshold:
        return {"level": None, "consecutive_count": 0, "escalated": False, "message": "No threshold configured"}

    key = f"{device_id}_{register_name}"
    tracker = _consecutive_tracker.get(key)
    now = int(time.time() * 1000)

    exceeds_warning = value > threshold["warning_threshold"]
    exceeds_critical = value > threshold["critical_threshold"]

    if not exceeds_warning:
        if tracker:
            del _consecutive_tracker[key]
        return {"level": None, "consecutive_count": 0, "escalated": False, "message": ""}

    if tracker:
        count = tracker["count"] + 1
        first_exceed_time = tracker["first_exceed_time"]
    else:
        count = 1
        first_exceed_time = now

    _consecutive_tracker[key] = {
        "count": count,
        "last_value": value,
        "first_exceed_time": first_exceed_time
    }

    meets_consecutive = count >= threshold["consecutive_count"]
    device_online_ok = not config.get("require_device_online", True) or device["online"]

    level = "warning"
    escalated = False

    if exceeds_critical and meets_consecutive and device_online_ok:
        level = "critical"
        escalated = True
    elif exceeds_critical and (not meets_consecutive or not device_online_ok):
        level = "warning"

    message = f"{device['name']} {register_name}超限: {value}"
    if escalated:
        message = f"[严重升级] {message} | 连续{count}次超限 | 设备在线: {device['online']}"
    elif count > 1:
        message = f"{message} | 连续{count}次"

    if level:
        alarm = {
            "id": f"alarm_{uuid.uuid4().hex[:8]}",
            "device_id": device_id,
            "register_name": register_name,
            "message": message,
            "level": level,
            "timestamp": now,
            "acknowledged": False,
            "consecutive_count": count,
            "escalated": escalated
        }
        _alarms.insert(0, alarm)
        if len(_alarms) > 100:
            _alarms[:] = _alarms[:100]

    return {
        "level": level,
        "consecutive_count": count,
        "escalated": escalated,
        "message": message,
        "require_device_online": config.get("require_device_online", True),
        "device_online": device["online"],
        "threshold": threshold
    }


def get_alarms(level: Optional[str] = None, acknowledged: Optional[bool] = None) -> List[Dict[str, Any]]:
    result = _alarms
    if level:
        result = [a for a in result if a["level"] == level]
    if acknowledged is not None:
        result = [a for a in result if a["acknowledged"] == acknowledged]
    return result


def acknowledge_alarm(alarm_id: str) -> Dict[str, Any]:
    for alarm in _alarms:
        if alarm["id"] == alarm_id:
            alarm["acknowledged"] = True
            return {"status": "acknowledged", "alarm": alarm}
    return {"status": "not_found"}


def acknowledge_all_alarms() -> Dict[str, Any]:
    for alarm in _alarms:
        alarm["acknowledged"] = True
    return {"status": "all_acknowledged", "count": len(_alarms)}


def clear_all_alarms() -> Dict[str, Any]:
    _alarms.clear()
    _consecutive_tracker.clear()
    return {"status": "cleared"}


def get_consecutive_trackers() -> Dict[str, Any]:
    return _consecutive_tracker
