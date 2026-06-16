export interface ModbusRegister {
  address: number
  name: string
  type: 'coil' | 'discrete' | 'holding' | 'input'
  value: number | boolean
  unit: string
  updatedAt: number
}

export interface AlarmThreshold {
  registerName: string
  warningThreshold: number
  criticalThreshold: number
  consecutiveCount: number
}

export interface ConsecutiveExceedTracker {
  deviceId_registerName: string
  count: number
  lastValue: number
  firstExceedTime: number
}

export interface MultiConditionAlarmConfig {
  requireDeviceOnline: boolean
  thresholds: AlarmThreshold[]
}

export interface Device {
  id: string
  name: string
  ip: string
  port: number
  slaveId: number
  online: boolean
  registers: ModbusRegister[]
}

export interface Alarm {
  id: string
  deviceId: string
  register: string
  message: string
  level: 'info' | 'warning' | 'critical'
  timestamp: number
  acknowledged: boolean
  consecutiveCount?: number
  escalated?: boolean
}
