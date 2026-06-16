from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class ModbusRegister(BaseModel):
    address: int
    name: str
    type: str
    value: float
    unit: str

class AlarmThreshold(BaseModel):
    register_name: str
    warning_threshold: float
    critical_threshold: float
    consecutive_count: int = 3

class MultiConditionAlarmConfig(BaseModel):
    require_device_online: bool = True
    thresholds: List[AlarmThreshold] = []

class ConsecutiveExceedTracker(BaseModel):
    key: str
    count: int
    last_value: float
    first_exceed_time: int

class Device(BaseModel):
    id: str
    name: str
    ip: str
    port: int
    slave_id: int
    online: bool
    registers: List[ModbusRegister] = []

class Alarm(BaseModel):
    id: str
    device_id: str
    register_name: str
    message: str
    level: str
    timestamp: int
    acknowledged: bool = False
    consecutive_count: Optional[int] = None
    escalated: Optional[bool] = None
