import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Device, Alarm, ModbusRegister, AlarmThreshold, MultiConditionAlarmConfig } from '../types'

export const useModbusStore = defineStore('modbus', () => {
  const devices = ref<Device[]>([])
  const alarms = ref<Alarm[]>([])
  const historyData = ref<Record<string, { time: number[]; values: number[] }>>({})
  const isPolling = ref(false)
  const pollInterval = ref(1000)
  const selectedDevice = ref<Device | null>(null)

  const consecutiveExceedTracker = ref<Record<string, { count: number; lastValue: number; firstExceedTime: number }>>({})

  const alarmConfig = ref<MultiConditionAlarmConfig>({
    requireDeviceOnline: true,
    thresholds: [
      { registerName: '温度', warningThreshold: 28, criticalThreshold: 30, consecutiveCount: 3 },
      { registerName: '湿度', warningThreshold: 70, criticalThreshold: 80, consecutiveCount: 3 },
      { registerName: '管道压力', warningThreshold: 3.8, criticalThreshold: 4.5, consecutiveCount: 3 },
      { registerName: '电流', warningThreshold: 15, criticalThreshold: 20, consecutiveCount: 3 },
      { registerName: '瞬时流量', warningThreshold: 180, criticalThreshold: 220, consecutiveCount: 3 },
    ]
  })

  const criticalAlarms = computed(() => alarms.value.filter(a => a.level === 'critical' && !a.acknowledged))
  const warningAlarms = computed(() => alarms.value.filter(a => a.level === 'warning' && !a.acknowledged))
  const onlineDevices = computed(() => devices.value.filter(d => d.online))
  const escalatedAlarms = computed(() => alarms.value.filter(a => a.escalated && !a.acknowledged))

  function getThreshold(registerName: string): AlarmThreshold | undefined {
    return alarmConfig.value.thresholds.find(t => t.registerName === registerName)
  }

  function getTrackerKey(deviceId: string, registerName: string): string {
    return `${deviceId}_${registerName}`
  }

  function evaluateMultiConditionAlarm(
    dev: Device,
    reg: ModbusRegister & { value: number },
    threshold: AlarmThreshold
  ): { level: 'warning' | 'critical' | null; consecutiveCount: number; escalated: boolean } {
    const key = getTrackerKey(dev.id, reg.name)
    const tracker = consecutiveExceedTracker.value[key]
    const now = Date.now()
    const value = reg.value

    const exceedsWarning = value > threshold.warningThreshold
    const exceedsCritical = value > threshold.criticalThreshold

    if (!exceedsWarning) {
      if (tracker) {
        delete consecutiveExceedTracker.value[key]
      }
      return { level: null, consecutiveCount: 0, escalated: false }
    }

    let count: number
    let firstExceedTime: number
    if (tracker) {
      count = tracker.count + 1
      firstExceedTime = tracker.firstExceedTime
    } else {
      count = 1
      firstExceedTime = now
    }

    consecutiveExceedTracker.value[key] = {
      count,
      lastValue: value,
      firstExceedTime
    }

    const meetsConsecutive = count >= threshold.consecutiveCount
    const deviceOnlineOk = !alarmConfig.value.requireDeviceOnline || dev.online

    let level: 'warning' | 'critical' | null = 'warning'
    let escalated = false

    if (exceedsCritical && meetsConsecutive && deviceOnlineOk) {
      level = 'critical'
      escalated = true
    } else if (exceedsCritical && (!meetsConsecutive || !deviceOnlineOk)) {
      level = 'warning'
    } else if (meetsConsecutive && deviceOnlineOk) {
      level = 'warning'
    }

    return { level, consecutiveCount: count, escalated }
  }

  function initMockDevices() {
    devices.value = [
      {
        id: 'dev1', name: '温湿度传感器-A区', ip: '192.168.1.101', port: 502, slaveId: 1, online: true,
        registers: [
          { address: 0, name: '温度', type: 'holding', value: 25.6, unit: '°C', updatedAt: Date.now() },
          { address: 1, name: '湿度', type: 'holding', value: 62.3, unit: '%RH', updatedAt: Date.now() },
          { address: 2, name: '露点', type: 'holding', value: 17.8, unit: '°C', updatedAt: Date.now() },
        ]
      },
      {
        id: 'dev2', name: '压力变送器-B区', ip: '192.168.1.102', port: 502, slaveId: 2, online: true,
        registers: [
          { address: 0, name: '管道压力', type: 'holding', value: 3.45, unit: 'MPa', updatedAt: Date.now() },
          { address: 1, name: '差压', type: 'holding', value: 0.12, unit: 'kPa', updatedAt: Date.now() },
        ]
      },
      {
        id: 'dev3', name: '电机控制器-C区', ip: '192.168.1.103', port: 502, slaveId: 3, online: false,
        registers: [
          { address: 0, name: '转速', type: 'holding', value: 1480, unit: 'RPM', updatedAt: Date.now() },
          { address: 1, name: '电流', type: 'holding', value: 12.5, unit: 'A', updatedAt: Date.now() },
          { address: 2, name: '运行状态', type: 'coil', value: true, unit: '', updatedAt: Date.now() },
        ]
      },
      {
        id: 'dev4', name: '流量计-D区', ip: '192.168.1.104', port: 502, slaveId: 4, online: true,
        registers: [
          { address: 0, name: '瞬时流量', type: 'holding', value: 156.7, unit: 'L/min', updatedAt: Date.now() },
          { address: 1, name: '累计流量', type: 'holding', value: 98234, unit: 'L', updatedAt: Date.now() },
        ]
      },
    ]
    selectedDevice.value = devices.value[0]
  }

  function simulatePoll() {
    for (const dev of devices.value) {
      if (!dev.online) continue
      for (const reg of dev.registers) {
        if (typeof reg.value === 'number') {
          const noise = (Math.random() - 0.5) * reg.value * 0.02
          reg.value = Math.round((reg.value + noise) * 100) / 100
          reg.updatedAt = Date.now()
          const key = `${dev.id}_${reg.address}`
          if (!historyData.value[key]) historyData.value[key] = { time: [], values: [] }
          historyData.value[key].time.push(Date.now())
          historyData.value[key].values.push(reg.value)
          if (historyData.value[key].time.length > 100) {
            historyData.value[key].time.shift()
            historyData.value[key].values.shift()
          }

          const threshold = getThreshold(reg.name)
          if (threshold) {
            const result = evaluateMultiConditionAlarm(dev, reg as ModbusRegister & { value: number }, threshold)
            if (result.level) {
              let message = `${dev.name} ${reg.name}超限: ${reg.value}${reg.unit}`
              if (result.escalated) {
                message = `[严重升级] ${message} | 连续${result.consecutiveCount}次超限 | 设备在线: ${dev.online}`
              } else if (result.consecutiveCount > 1) {
                message = `${message} | 连续${result.consecutiveCount}次`
              }
              alarms.value.unshift({
                id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                deviceId: dev.id,
                register: reg.name,
                message,
                level: result.level,
                timestamp: Date.now(),
                acknowledged: false,
                consecutiveCount: result.consecutiveCount,
                escalated: result.escalated
              })
            }
          }
        }
      }
    }
    if (alarms.value.length > 100) alarms.value = alarms.value.slice(0, 100)
  }

  function acknowledgeAlarm(id: string) {
    const a = alarms.value.find(a => a.id === id)
    if (a) a.acknowledged = true
  }

  function acknowledgeAllAlarms() {
    alarms.value.forEach(a => a.acknowledged = true)
  }

  function clearAlarms() {
    alarms.value = []
    consecutiveExceedTracker.value = {}
  }

  function toggleDevice(id: string) {
    const d = devices.value.find(d => d.id === id)
    if (d) d.online = !d.online
  }

  function updateThreshold(registerName: string, updates: Partial<AlarmThreshold>) {
    const idx = alarmConfig.value.thresholds.findIndex(t => t.registerName === registerName)
    if (idx >= 0) {
      alarmConfig.value.thresholds[idx] = { ...alarmConfig.value.thresholds[idx], ...updates }
    } else if (updates.warningThreshold !== undefined && updates.criticalThreshold !== undefined && updates.consecutiveCount !== undefined) {
      alarmConfig.value.thresholds.push({ registerName, ...updates } as AlarmThreshold)
    }
  }

  function simulateSpike(deviceId: string, registerName: string, targetValue: number, count: number = 1) {
    const dev = devices.value.find(d => d.id === deviceId)
    if (!dev) return
    const reg = dev.registers.find(r => r.name === registerName)
    if (!reg || typeof reg.value !== 'number') return
    for (let i = 0; i < count; i++) {
      reg.value = Math.round(targetValue * 100) / 100
      reg.updatedAt = Date.now()
      const key = `${dev.id}_${reg.address}`
      if (!historyData.value[key]) historyData.value[key] = { time: [], values: [] }
      historyData.value[key].time.push(Date.now())
      historyData.value[key].values.push(reg.value)
      if (historyData.value[key].time.length > 100) {
        historyData.value[key].time.shift()
        historyData.value[key].values.shift()
      }
      const threshold = getThreshold(reg.name)
      if (threshold) {
        const result = evaluateMultiConditionAlarm(dev, reg as ModbusRegister & { value: number }, threshold)
        if (result.level) {
          let message = `${dev.name} ${reg.name}超限: ${reg.value}${reg.unit}`
          if (result.escalated) {
            message = `[严重升级] ${message} | 连续${result.consecutiveCount}次超限 | 设备在线: ${dev.online}`
          } else if (result.consecutiveCount > 1) {
            message = `${message} | 连续${result.consecutiveCount}次`
          }
          alarms.value.unshift({
            id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            deviceId: dev.id,
            register: reg.name,
            message,
            level: result.level,
            timestamp: Date.now(),
            acknowledged: false,
            consecutiveCount: result.consecutiveCount,
            escalated: result.escalated
          })
        }
      }
    }
    if (alarms.value.length > 100) alarms.value = alarms.value.slice(0, 100)
  }

  return {
    devices, alarms, historyData, isPolling, pollInterval, selectedDevice,
    alarmConfig, consecutiveExceedTracker,
    criticalAlarms, warningAlarms, onlineDevices, escalatedAlarms,
    initMockDevices, simulatePoll, acknowledgeAlarm, acknowledgeAllAlarms,
    clearAlarms, toggleDevice, updateThreshold, simulateSpike, getThreshold
  }
})
