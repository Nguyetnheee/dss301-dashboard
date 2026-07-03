import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Battery, Navigation, CheckCircle, Upload, Search, ShieldAlert, Award } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Default mock data in case the user doesn't upload a CSV immediately
const defaultData = [
  { battery_level_pct: 11, wind_speed_mps: 1.22, distance_to_base_m: 1346, flight_time_s: 1734, altitude_m: 46, gps_lat: 31.904, gps_lon: 73.946, timestamp: "2024-07-27 05:00:00", mission_id: "MSN1934", mission_type: "Scan", Drone_ID: "DRN-009", DSS_Recommendation: "Return to Base", Confidence_Score: 1.0, Risk_Factor: "Critical: Low Battery" },
  { battery_level_pct: 49, wind_speed_mps: 3.55, distance_to_base_m: 466, flight_time_s: 2552, altitude_m: 113, gps_lat: 32.112, gps_lon: 72.845, timestamp: "2024-07-27 05:15:00", mission_id: "MSN1409", mission_type: "Patrol", Drone_ID: "DRN-002", DSS_Recommendation: "Continue Mission", Confidence_Score: 1.0, Risk_Factor: "Safe / Normal Operation" },
  { battery_level_pct: 60, wind_speed_mps: 6.90, distance_to_base_m: 392, flight_time_s: 629, altitude_m: 79, gps_lat: 31.954, gps_lon: 73.447, timestamp: "2024-07-27 05:30:00", mission_id: "MSN5506", mission_type: "Patrol", Drone_ID: "DRN-009", DSS_Recommendation: "Delay Mission", Confidence_Score: 0.98, Risk_Factor: "Critical: High Wind Speed" },
  { battery_level_pct: 57, wind_speed_mps: 1.95, distance_to_base_m: 331, flight_time_s: 2997, altitude_m: 93, gps_lat: 32.415, gps_lon: 72.089, timestamp: "2024-07-27 05:45:00", mission_id: "MSN5012", mission_type: "Scan", Drone_ID: "DRN-003", DSS_Recommendation: "Continue Mission", Confidence_Score: 0.99, Risk_Factor: "Safe / Normal Operation" },
  { battery_level_pct: 80, wind_speed_mps: 4.05, distance_to_base_m: 483, flight_time_s: 686, altitude_m: 89, gps_lat: 32.849, gps_lon: 72.996, timestamp: "2024-07-27 06:00:00", mission_id: "MSN2679", mission_type: "Patrol", Drone_ID: "DRN-001", DSS_Recommendation: "Continue Mission", Confidence_Score: 1.0, Risk_Factor: "Safe / Normal Operation" },
  { battery_level_pct: 5, wind_speed_mps: 3.66, distance_to_base_m: 536, flight_time_s: 418, altitude_m: 113, gps_lat: 32.048, gps_lon: 72.688, timestamp: "2024-07-27 06:15:00", mission_id: "MSN9928", mission_type: "Scan", Drone_ID: "DRN-004", DSS_Recommendation: "Return to Base", Confidence_Score: 1.0, Risk_Factor: "Critical: Low Battery" },
  { battery_level_pct: 14, wind_speed_mps: 1.65, distance_to_base_m: 446, flight_time_s: 1920, altitude_m: 40, gps_lat: 32.769, gps_lon: 72.448, timestamp: "2024-07-27 06:30:00", mission_id: "MSN4611", mission_type: "Track", Drone_ID: "DRN-007", DSS_Recommendation: "Return to Base", Confidence_Score: 1.0, Risk_Factor: "Critical: Low Battery" },
  { battery_level_pct: 10, wind_speed_mps: 3.61, distance_to_base_m: 648, flight_time_s: 2921, altitude_m: 30, gps_lat: 31.626, gps_lon: 72.138, timestamp: "2024-07-27 06:45:00", mission_id: "MSN8359", mission_type: "Patrol", Drone_ID: "DRN-007", DSS_Recommendation: "Return to Base", Confidence_Score: 1.0, Risk_Factor: "Critical: Low Battery" },
  { battery_level_pct: 34, wind_speed_mps: 5.03, distance_to_base_m: 127, flight_time_s: 2148, altitude_m: 41, gps_lat: 32.607, gps_lon: 73.876, timestamp: "2024-07-27 07:00:00", mission_id: "MSN3615", mission_type: "Scan", Drone_ID: "DRN-005", DSS_Recommendation: "Continue Mission", Confidence_Score: 0.99, Risk_Factor: "Safe / Normal Operation" },
  { battery_level_pct: 73, wind_speed_mps: 2.29, distance_to_base_m: 73, flight_time_s: 264, altitude_m: 72, gps_lat: 31.761, gps_lon: 73.080, timestamp: "2024-07-27 07:15:00", mission_id: "MSN5741", mission_type: "Patrol", Drone_ID: "DRN-007", DSS_Recommendation: "Continue Mission", Confidence_Score: 1.0, Risk_Factor: "Safe / Normal Operation" },
  { battery_level_pct: 9, wind_speed_mps: 2.50, distance_to_base_m: 1857, flight_time_s: 859, altitude_m: 59, gps_lat: 31.690, gps_lon: 72.233, timestamp: "2024-07-27 07:30:00", mission_id: "MSN2307", mission_type: "Scan", Drone_ID: "DRN-005", DSS_Recommendation: "Return to Base", Confidence_Score: 1.0, Risk_Factor: "Critical: Low Battery" },
  { battery_level_pct: 40, wind_speed_mps: 5.08, distance_to_base_m: 1628, flight_time_s: 4257, altitude_m: 73, gps_lat: 32.324, gps_lon: 73.343, timestamp: "2024-07-27 07:45:00", mission_id: "MSN8428", mission_type: "Patrol", Drone_ID: "DRN-005", DSS_Recommendation: "Continue Mission", Confidence_Score: 0.99, Risk_Factor: "Safe / Normal Operation" },
  { battery_level_pct: 25, wind_speed_mps: 2.48, distance_to_base_m: 208, flight_time_s: 643, altitude_m: 80, gps_lat: 32.966, gps_lon: 73.684, timestamp: "2024-07-27 08:00:00", mission_id: "MSN7065", mission_type: "Circle", Drone_ID: "DRN-006", DSS_Recommendation: "Continue Mission", Confidence_Score: 1.0, Risk_Factor: "Safe / Normal Operation" },
  { battery_level_pct: 31, wind_speed_mps: 5.18, distance_to_base_m: 1022, flight_time_s: 2425, altitude_m: 94, gps_lat: 32.572, gps_lon: 72.230, timestamp: "2024-07-27 08:15:00", mission_id: "MSN3803", mission_type: "Patrol", Drone_ID: "DRN-010", DSS_Recommendation: "Continue Mission", Confidence_Score: 0.99, Risk_Factor: "Safe / Normal Operation" },
  { battery_level_pct: 12, wind_speed_mps: 2.59, distance_to_base_m: 1685, flight_time_s: 860, altitude_m: 52, gps_lat: 31.783, gps_lon: 73.832, timestamp: "2024-07-27 08:30:00", mission_id: "MSN5010", mission_type: "Patrol", Drone_ID: "DRN-010", DSS_Recommendation: "Return to Base", Confidence_Score: 1.0, Risk_Factor: "Critical: Low Battery" },
  { battery_level_pct: 69, wind_speed_mps: 4.61, distance_to_base_m: 167, flight_time_s: 1278, altitude_m: 83, gps_lat: 32.659, gps_lon: 73.791, timestamp: "2024-07-27 08:45:00", mission_id: "MSN2519", mission_type: "Patrol", Drone_ID: "DRN-010", DSS_Recommendation: "Continue Mission", Confidence_Score: 1.0, Risk_Factor: "Safe / Normal Operation" },
];

export default function App() {
  const [data, setData] = useState<any[]>(defaultData);
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>('DRN-009');

  // Xử lý upload file CSV từ user
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      const parsedData: any[] = [];
      // Parse tối đa 1000 dòng để tránh lag giao diện
      const limit = Math.min(lines.length, 1000);
      
      for (let i = 1; i < limit; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',');
        if (values.length === headers.length) {
          let row: any = {};
          headers.forEach((header, index) => {
            let val: any = values[index].trim();
            if (!isNaN(val as any) && val !== '') {
              val = parseFloat(val);
            }
            row[header] = val;
          });
          parsedData.push(row);
        }
      }
      if (parsedData.length > 0) {
        setData(parsedData);
        // Chọn mặc định drone đầu tiên trong danh sách mới
        if (parsedData[0].Drone_ID) {
          setSelectedDroneId(parsedData[0].Drone_ID);
        }
      }
    };
    reader.readAsText(file);
  };

  // 1. Lọc dữ liệu theo Slicer và ô Tìm kiếm
  const filteredData = useMemo(() => {
    return data.filter(d => {
      const matchesFilter = filter === 'All' || d.DSS_Recommendation === filter;
      const matchesSearch = searchQuery === '' || 
        (d.Drone_ID && d.Drone_ID.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (d.mission_id && String(d.mission_id).toLowerCase().includes(searchQuery.toLowerCase())) ||
        (d.Risk_Factor && d.Risk_Factor.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesFilter && matchesSearch;
    });
  }, [data, filter, searchQuery]);

  // 2. Tính toán các Drones duy nhất và trạng thái hiện tại (telemetry mới nhất của từng drone)
  const droneLatestState = useMemo(() => {
    const latest: Record<string, any> = {};
    // Sắp xếp theo timestamp nếu có để lấy trạng thái mới nhất, nếu không lấy dòng xuất hiện cuối cùng
    const sortedData = [...data].sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      }
      return 0;
    });

    sortedData.forEach(d => {
      if (d.Drone_ID) {
        latest[d.Drone_ID] = d;
      }
    });
    return latest;
  }, [data]);

  const dronesList = useMemo(() => Object.values(droneLatestState), [droneLatestState]);

  // 3. Tính toán KPIs chính xác
  const kpis = useMemo(() => {
    const totalDrones = dronesList.length;
    if (totalDrones === 0) {
      return { totalDrones: 0, highRiskRate: 0, avgBattery: 0, completionRate: 0 };
    }

    // A. High Risk Drones
    const highRiskDronesCount = dronesList.filter(d => {
      const isLowBattery = (d.battery_level_pct || 0) < 20;
      const isHighWind = (d.wind_speed_mps || 0) > 6.5;
      const isReturnBase = d.DSS_Recommendation === 'Return to Base';
      return isLowBattery || isHighWind || isReturnBase;
    }).length;
    const highRiskRate = (highRiskDronesCount / totalDrones) * 100;

    // B. Average Battery
    const sumBattery = dronesList.reduce((acc, curr) => acc + (curr.battery_level_pct || 0), 0);
    const avgBattery = sumBattery / totalDrones;

    // C. Mission Completion Rate
    // Group telemetry theo mission_id
    const missions: Record<string, { failed: boolean }> = {};
    data.forEach(d => {
      if (d.mission_id) {
        if (!missions[d.mission_id]) {
          missions[d.mission_id] = { failed: false };
        }
        // Nếu AI khuyến nghị Return to Base tại bất cứ điểm nào, coi như nhiệm vụ thất bại / phải hủy giữa chừng
        if (d.DSS_Recommendation === 'Return to Base') {
          missions[d.mission_id].failed = true;
        }
      }
    });

    const missionKeys = Object.keys(missions);
    const totalMissions = missionKeys.length;
    const completedMissions = missionKeys.filter(k => !missions[k].failed).length;
    const completionRate = totalMissions > 0 ? (completedMissions / totalMissions) * 100 : 0;

    return {
      totalDrones,
      highRiskRate,
      avgBattery,
      completionRate
    };
  }, [data, dronesList]);

  // 4. Phân bổ khuyến nghị AI cho biểu đồ tròn
  const recommendationDistribution = useMemo(() => {
    const counts = { 'Continue Mission': 0, 'Return to Base': 0, 'Delay Mission': 0 };
    let total = 0;
    dronesList.forEach(d => {
      const rec = d.DSS_Recommendation;
      if (rec && counts[rec as keyof typeof counts] !== undefined) {
        counts[rec as keyof typeof counts]++;
        total++;
      }
    });
    return {
      continuePct: total > 0 ? (counts['Continue Mission'] / total) * 100 : 0,
      returnPct: total > 0 ? (counts['Return to Base'] / total) * 100 : 0,
      delayPct: total > 0 ? (counts['Delay Mission'] / total) * 100 : 0,
      total
    };
  }, [dronesList]);

  // 5. Lấy lịch sử mức pin của Drone đang được chọn (Battery Trend Line)
  const selectedDroneHistory = useMemo(() => {
    if (!selectedDroneId) return [];
    return data
      .filter(d => d.Drone_ID === selectedDroneId)
      .sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }
        return 0;
      });
  }, [data, selectedDroneId]);

  // 6. Cấu hình bản đồ vệ tinh thực tế Leaflet cho Ninh Thuận
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Trung tâm dự án Nhà máy điện mặt trời Trung Nam, Thuận Bắc, Ninh Thuận
  const ninhThuanCenter = { lat: 11.6214, lng: 108.9785 };

  // Tính tọa độ trung tâm của dữ liệu nạp vào để làm gốc tọa độ
  const dataCenter = useMemo(() => {
    const lats = data.map(d => d.gps_lat).filter(Boolean);
    const lons = data.map(d => d.gps_lon).filter(Boolean);
    if (lats.length === 0) return { lat: 32.112, lon: 72.845 };
    return {
      lat: lats.reduce((a, b) => a + b, 0) / lats.length,
      lon: lons.reduce((a, b) => a + b, 0) / lons.length
    };
  }, [data]);

  // Hàm dịch chuyển tọa độ từ dữ liệu gốc sang tọa độ Ninh Thuận
  const getRealCoordinates = (gps_lat: number, gps_lon: number): [number, number] => {
    if (!gps_lat || !gps_lon) return [ninhThuanCenter.lat, ninhThuanCenter.lng];
    const offsetLat = gps_lat - dataCenter.lat;
    const offsetLon = gps_lon - dataCenter.lon;
    // Độ khuếch đại khoảng cách để các drone không bị quá khít nhau trên bản đồ thực tế
    return [ninhThuanCenter.lat + offsetLat * 0.4, ninhThuanCenter.lng + offsetLon * 0.4];
  };

  // Tính bounds để hiển thị toàn bộ phi đội
  const realBounds = useMemo(() => {
    const points = dronesList.map(d => {
      if (!d.gps_lat || !d.gps_lon) return null;
      return getRealCoordinates(d.gps_lat, d.gps_lon);
    }).filter(Boolean) as [number, number][];

    if (points.length === 0) return null;
    return L.latLngBounds(points);
  }, [dronesList, dataCenter]);

  // Khởi tạo bản đồ Leaflet
  useEffect(() => {
    if (!mapRef.current) {
      const map = L.map('leaflet-map-container', {
        center: [ninhThuanCenter.lat, ninhThuanCenter.lng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false
      });

      // Lớp ảnh vệ tinh độ phân giải cao của ArcGIS Esri
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapRef.current = map;
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Cập nhật Marker khi danh sách Drone hoặc lựa chọn Drone thay đổi
  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    dronesList.forEach(d => {
      if (!d.gps_lat || !d.gps_lon) return;

      const [lat, lon] = getRealCoordinates(d.gps_lat, d.gps_lon);
      const isSelected = selectedDroneId === d.Drone_ID;

      let pulseColor = 'bg-emerald-500';
      let bgColor = 'bg-emerald-500';
      if (d.DSS_Recommendation === 'Return to Base') {
        pulseColor = 'bg-red-500';
        bgColor = 'bg-red-500';
      } else if (d.DSS_Recommendation === 'Delay Mission') {
        pulseColor = 'bg-amber-500';
        bgColor = 'bg-amber-500';
      }

      const droneIdShort = d.Drone_ID.replace('DRN-', '');

      const customIcon = L.divIcon({
        className: 'custom-drone-icon-wrap',
        html: `
          <div class="relative flex items-center justify-center pointer-events-none" style="width: 24px; height: 24px;">
            ${(isSelected || d.DSS_Recommendation === 'Return to Base') ? `<div class="absolute w-8 h-8 rounded-full ${pulseColor} opacity-30 animate-ping"></div>` : ''}
            <div class="w-6 h-6 rounded-full ${bgColor} border-2 ${isSelected ? 'border-white scale-125' : 'border-slate-800'} shadow-lg flex items-center justify-center transition-all">
              <span class="text-[9px] text-white font-extrabold">${droneIdShort}</span>
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([lat, lon], { icon: customIcon });

      // Custom Tooltip
      marker.bindTooltip(`
        <div style="font-family: sans-serif; background-color: #0f172a; color: #f8fafc; border: 1px solid #334155; padding: 6px 10px; border-radius: 6px; font-size: 11px;">
          <div style="font-weight: bold; margin-bottom: 2px;">Drone: ${d.Drone_ID}</div>
          <div>Mức pin: ${d.battery_level_pct}%</div>
          <div>Tốc độ gió: ${d.wind_speed_mps.toFixed(2)} m/s</div>
          <div style="color: #fbbf24; font-weight: bold; margin-top: 4px;">AI: ${d.DSS_Recommendation}</div>
        </div>
      `, {
        className: 'custom-leaflet-tooltip',
        direction: 'top',
        offset: [0, -10]
      });

      marker.on('click', () => {
        setSelectedDroneId(d.Drone_ID);
      });

      marker.addTo(markersLayer);
    });

    // Zoom vừa vặn các Drone
    if (realBounds && dronesList.length > 0) {
      map.fitBounds(realBounds, { padding: [40, 40] });
    }
  }, [dronesList, selectedDroneId, realBounds]);

  // Tự động di chuyển camera đến drone khi click chọn drone trên bảng
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDroneId) return;

    const activeDrone = dronesList.find(d => d.Drone_ID === selectedDroneId);
    if (activeDrone && activeDrone.gps_lat && activeDrone.gps_lon) {
      const [lat, lon] = getRealCoordinates(activeDrone.gps_lat, activeDrone.gps_lon);
      map.flyTo([lat, lon], 17, { animate: true, duration: 1.2 });
    }
  }, [selectedDroneId]);

  // 7. Tạo danh sách Cảnh báo (Alert Panel) từ các drone rủi ro
  const alertsList = useMemo(() => {
    const alerts: any[] = [];
    dronesList.forEach(d => {
      if ((d.battery_level_pct || 0) < 20) {
        alerts.push({
          id: `${d.Drone_ID}-battery`,
          type: 'danger',
          drone: d.Drone_ID,
          message: `Low Battery warning: ${d.battery_level_pct}%`,
          action: 'Return Immediately'
        });
      }
      if ((d.wind_speed_mps || 0) > 6.5) {
        alerts.push({
          id: `${d.Drone_ID}-wind`,
          type: 'warning',
          drone: d.Drone_ID,
          message: `High Wind speed warning: ${d.wind_speed_mps.toFixed(2)} m/s`,
          action: 'Delay Mission / Deploy Backup'
        });
      }
      if (d.DSS_Recommendation === 'Return to Base' && (d.battery_level_pct || 0) >= 20) {
        alerts.push({
          id: `${d.Drone_ID}-base`,
          type: 'critical',
          drone: d.Drone_ID,
          message: `Distance/Altitude Risk detected. AI recommends Return.`,
          action: 'Initiate RTL protocol'
        });
      }
    });
    return alerts;
  }, [dronesList]);

  // CSS Conic Gradient cho Donut Chart
  const conicGradient = `conic-gradient(
    #10b981 0% ${recommendationDistribution.continuePct}%, 
    #ef4444 ${recommendationDistribution.continuePct}% ${recommendationDistribution.continuePct + recommendationDistribution.returnPct}%, 
    #f59e0b ${recommendationDistribution.continuePct + recommendationDistribution.returnPct}% 100%
  )`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans antialiased selection:bg-amber-500 selection:text-black">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-5 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-bold bg-amber-500 text-black rounded tracking-widest uppercase">Decision Support System</span>
            <span className="text-xs text-slate-400 font-mono">v1.2.0</span>
          </div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 tracking-wide mt-1">
            NINH THUAN SOLAR FARM
          </h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Drone Fleet Control Hub — Operations Center
          </p>
        </div>
        
        {/* CSV Uploader */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-500 px-4 py-2.5 rounded-lg cursor-pointer transition-all shadow-md group">
            <Upload size={18} className="text-amber-400 group-hover:scale-110 transition" />
            <span className="text-sm font-semibold text-slate-200">Nạp CSV telemetry mới nhất</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* TIER 1: KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* KPI 1: Active Drones */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 hover:border-slate-700 transition shadow-lg relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 text-slate-100 pointer-events-none">
            <Navigation size={120} />
          </div>
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-350 text-sm font-extrabold uppercase tracking-wider">Active Fleet</p>
            <span className="p-2 bg-blue-500/10 rounded-lg text-blue-400 group-hover:scale-110 transition">
              <Navigation size={18} />
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <h2 className="text-5xl font-black text-white tracking-tight">{kpis.totalDrones}</h2>
            <span className="text-slate-300 text-sm font-bold ml-1">UAVs online</span>
          </div>
          <div className="mt-3.5 text-xs text-slate-400 font-medium">
            Tổng số drone đang gửi dữ liệu
          </div>
        </div>

        {/* KPI 2: High Risk Rate */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 hover:border-slate-700 transition shadow-lg relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 text-slate-100 pointer-events-none">
            <ShieldAlert size={120} />
          </div>
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-350 text-sm font-extrabold uppercase tracking-wider">High Risk Rate</p>
            <span className={`p-2 rounded-lg group-hover:scale-110 transition ${kpis.highRiskRate > 15 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
              <ShieldAlert size={18} />
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <h2 className="text-5xl font-black text-white tracking-tight">
              {kpis.highRiskRate.toFixed(1)}%
            </h2>
            <span className={`text-sm font-extrabold ml-1 ${kpis.highRiskRate > 15 ? 'text-red-450 animate-pulse' : 'text-emerald-400'}`}>
              {kpis.highRiskRate > 15 ? 'Cảnh báo cao' : 'Mức an toàn'}
            </span>
          </div>
          <div className="mt-3.5 text-xs text-slate-400 font-medium">
            Tỷ lệ drone gặp sự cố pin/gió hoặc AI khuyên Return
          </div>
        </div>

        {/* KPI 3: Average Battery */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 hover:border-slate-700 transition shadow-lg relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 text-slate-100 pointer-events-none">
            <Battery size={120} />
          </div>
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-350 text-sm font-extrabold uppercase tracking-wider">Fleet Avg Battery</p>
            <span className={`p-2 rounded-lg group-hover:scale-110 transition ${kpis.avgBattery < 35 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
              <Battery size={18} />
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <h2 className="text-5xl font-black text-white tracking-tight">
              {kpis.avgBattery.toFixed(1)}%
            </h2>
            <span className="text-slate-300 text-sm font-bold ml-1">Trung bình</span>
          </div>
          <div className="mt-3.5 text-xs text-slate-400 font-medium">
            Pin trung bình toàn đội. {kpis.avgBattery < 40 ? 'Đề xuất đổi ca pin' : 'Đủ điều kiện hoạt động'}
          </div>
        </div>

        {/* KPI 4: Mission Completion Rate */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 hover:border-slate-700 transition shadow-lg relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 text-slate-100 pointer-events-none">
            <Award size={120} />
          </div>
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-350 text-sm font-extrabold uppercase tracking-wider">Mission Completion Rate</p>
            <span className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 group-hover:scale-110 transition">
              <Award size={18} />
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <h2 className="text-5xl font-black text-emerald-400 tracking-tight">
              {kpis.completionRate.toFixed(1)}%
            </h2>
            <span className="text-slate-300 text-sm font-bold ml-1">Tỷ lệ thành công</span>
          </div>
          <div className="mt-3.5 text-xs text-slate-400 font-medium">
            Tỷ lệ nhiệm vụ kiểm tra hoàn thành trọn vẹn
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        
        {/* LEFT COLUMN: FILTERS & ALERTS */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          
          {/* ACTION SLICER */}
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-lg">
            <h3 className="text-slate-300 text-sm font-bold mb-4 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-3 bg-amber-500 rounded"></span> Bộ lọc AI (Slicer)
            </h3>
            
            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder="Tìm Drone, mã nhiệm vụ..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-slate-650 pl-9 pr-4 py-2.5 rounded-lg text-sm outline-none transition text-slate-200"
              />
            </div>

            <div className="flex flex-col gap-2">
              <button 
                onClick={() => setFilter('All')} 
                className={`text-left px-3 py-2.5 rounded-lg text-sm font-bold border transition ${filter === 'All' ? 'bg-slate-800 border-slate-700 text-white' : 'border-transparent text-slate-350 hover:bg-slate-800/40 hover:text-white'}`}
              >
                Tất cả (All)
              </button>
              
              <button 
                onClick={() => setFilter('Continue Mission')} 
                className={`text-left px-3 py-2.5 rounded-lg text-sm font-bold border flex items-center justify-between transition ${filter === 'Continue Mission' ? 'bg-emerald-950/40 border-emerald-500 text-emerald-250' : 'border-transparent text-slate-350 hover:bg-slate-800/40 hover:text-white'}`}
              >
                <span className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div> Continue Mission
                </span>
                <span className="text-xs text-slate-450 font-bold font-mono">AI</span>
              </button>
              
              <button 
                onClick={() => setFilter('Delay Mission')} 
                className={`text-left px-3 py-2.5 rounded-lg text-sm font-bold border flex items-center justify-between transition ${filter === 'Delay Mission' ? 'bg-amber-950/40 border-amber-500 text-amber-250' : 'border-transparent text-slate-350 hover:bg-slate-800/40 hover:text-white'}`}
              >
                <span className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div> Delay Mission
                </span>
                <span className="text-xs text-slate-450 font-bold font-mono">AI</span>
              </button>

              <button 
                onClick={() => setFilter('Return to Base')} 
                className={`text-left px-3 py-2.5 rounded-lg text-sm font-bold border flex items-center justify-between transition ${filter === 'Return to Base' ? 'bg-red-950/40 border-red-500 text-red-250' : 'border-transparent text-slate-350 hover:bg-slate-800/40 hover:text-white'}`}
              >
                <span className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> Return to Base
                </span>
                <span className="text-xs text-slate-450 font-bold font-mono">AI</span>
              </button>
            </div>
          </div>

          {/* ALERT PANEL */}
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-lg flex-grow flex flex-col">
            <h3 className="text-slate-300 text-sm font-bold mb-4 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-3 bg-red-500 rounded"></span> Bảng Cảnh báo (Alerts)
            </h3>
            
            <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
              {alertsList.map((alert) => (
                <div 
                  key={alert.id}
                  onClick={() => setSelectedDroneId(alert.drone)}
                  className={`p-3.5 rounded-lg border text-left cursor-pointer hover:scale-[1.02] transition-all relative overflow-hidden ${
                    alert.type === 'danger' ? 'bg-red-950/35 border-red-900 text-red-150' : 
                    alert.type === 'warning' ? 'bg-amber-950/35 border-amber-900 text-amber-150' : 
                    'bg-slate-950 border-slate-850 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-extrabold text-white">{alert.drone}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                      alert.type === 'danger' ? 'bg-red-500 text-white' : 'bg-amber-500 text-black'
                    }`}>
                      {alert.type === 'danger' ? 'critical' : 'warning'}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed mb-2 opacity-95 text-slate-200 font-medium">{alert.message}</p>
                  <div className="flex items-center gap-1 text-xs font-extrabold text-amber-400 hover:text-amber-300 transition">
                    <span>Hành động:</span>
                    <span>{alert.action} &rarr;</span>
                  </div>
                </div>
              ))}
              
              {alertsList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-slate-500 text-xs gap-2">
                  <CheckCircle className="text-emerald-500" size={24} />
                  <span>Hệ thống an toàn. Không có cảnh báo.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MIDDLE COLUMN: MAP & TRENDS */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* DRONE MAP */}
          <div className="md:col-span-2 bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-lg flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-slate-350 text-sm font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-3 bg-amber-500 rounded"></span> Bản đồ Drone (Drone Location Map)
              </h3>
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Ninh Thuận Grid
              </span>
            </div>
            
            {/* Live Leaflet Satellite Map */}
            <div className="relative flex-grow min-h-[300px] rounded-xl border border-slate-800 overflow-hidden">
              <div id="leaflet-map-container" className="w-full h-full min-h-[300px]" style={{ zIndex: 10 }}></div>
            </div>
          </div>

          {/* AI DONUT / SUMMARY */}
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-lg flex flex-col items-center justify-between">
            <h3 className="text-slate-350 text-sm font-bold uppercase tracking-wider self-start flex items-center gap-1.5">
              <span className="w-1.5 h-3 bg-emerald-500 rounded"></span> DSS Recommendations
            </h3>
            
            <div className="relative w-36 h-36 rounded-full flex items-center justify-center my-3" style={{ background: conicGradient }}>
              <div className="absolute w-26 h-26 bg-slate-900 rounded-full flex flex-col items-center justify-center shadow-inner">
                <span className="text-2xl font-black text-white">{recommendationDistribution.total}</span>
                <span className="text-xs text-slate-400 font-extrabold tracking-widest uppercase mt-0.5">Fleet Size</span>
              </div>
            </div>

            <div className="w-full flex flex-col gap-1 text-xs font-semibold mt-2">
              <div className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-850">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> Continue
                </span>
                <span className="font-bold text-white">{recommendationDistribution.continuePct.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-850">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-2 h-2 bg-amber-500 rounded-full"></span> Delay
                </span>
                <span className="font-bold text-white">{recommendationDistribution.delayPct.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center bg-slate-950 p-1.5 rounded border border-slate-850">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span> Return
                </span>
                <span className="font-bold text-white">{recommendationDistribution.returnPct.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TIER 2: BATTERY TRENDS LINE CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        
        {/* RECOMMENDATION DISTRIBUTION PROGRESS BARS */}
        <div className="lg:col-span-1 bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-slate-350 text-sm font-bold mb-4 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-3 bg-amber-500 rounded"></span> AI Recommendation Ratio
            </h3>
            <p className="text-slate-400 text-xs mb-4 font-medium">Mô hình Random Forest phân bổ đề xuất vận hành.</p>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="flex justify-between text-sm font-bold mb-1">
                <span>Continue Mission</span>
                <span className="text-emerald-400">{recommendationDistribution.continuePct.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${recommendationDistribution.continuePct}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm font-bold mb-1">
                <span>Delay Mission</span>
                <span className="text-amber-400">{recommendationDistribution.delayPct.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${recommendationDistribution.delayPct}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm font-bold mb-1">
                <span>Return to Base</span>
                <span className="text-red-400">{recommendationDistribution.returnPct.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${recommendationDistribution.returnPct}%` }}></div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 text-xs text-slate-450 font-medium leading-normal border-t border-slate-850 pt-3">
            *Dựa trên trọng số mô hình: Mức pin (45%), Tốc độ gió (25%), Khoảng cách trạm (20%), Độ cao bay (10%).
          </div>
        </div>

        {/* SELECTED DRONE BATTERY TREND CHART */}
        <div className="lg:col-span-3 bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-lg flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-slate-350 text-sm font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-3 bg-amber-500 rounded"></span> Biểu đồ xu hướng pin (Battery Trend)
            </h3>
            {selectedDroneId ? (
              <span className="px-2 py-0.5 text-sm font-bold bg-slate-800 text-white rounded">
                {selectedDroneId}
              </span>
            ) : (
              <span className="text-sm font-semibold text-slate-450">Chọn drone để xem biểu đồ xu hướng</span>
            )}
          </div>

          <div className="relative flex-grow min-h-[160px] bg-slate-950 border border-slate-800/80 rounded-xl flex items-center justify-center p-4">
            {selectedDroneId && selectedDroneHistory.length > 0 ? (
              <svg className="w-full h-full min-h-[150px]" viewBox="0 0 500 120" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="batteryGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Y Axis Grid Lines */}
                <line x1="0" y1="12" x2="500" y2="12" stroke="#334155" strokeWidth="0.5" opacity="0.3" strokeDasharray="4 4" />
                <line x1="0" y1="60" x2="500" y2="60" stroke="#334155" strokeWidth="0.5" opacity="0.3" strokeDasharray="4 4" />
                <line x1="0" y1="108" x2="500" y2="108" stroke="#334155" strokeWidth="0.5" opacity="0.3" strokeDasharray="4 4" />
                
                {/* Text indicators */}
                <text x="5" y="10" fill="#94a3b8" fontSize="9" fontWeight="bold">100%</text>
                <text x="5" y="58" fill="#94a3b8" fontSize="9" fontWeight="bold">50%</text>
                <text x="5" y="106" fill="#94a3b8" fontSize="9" fontWeight="bold">10%</text>

                {/* Render SVG Line and Gradient Area */}
                {(() => {
                  const points = selectedDroneHistory.map((d, index) => {
                    const x = (index / (selectedDroneHistory.length - 1)) * 480 + 10;
                    // Scale battery level (0-100) to height range (110-10)
                    const y = 110 - (d.battery_level_pct / 100) * 100;
                    return { x, y, val: d.battery_level_pct };
                  });

                  const linePath = points.map(p => `${p.x},${p.y}`).join(' ');
                  const areaPath = `${points[0].x},110 ` + linePath + ` ${points[points.length - 1].x},110`;

                  return (
                    <g>
                      {/* Gradient Fill */}
                      <polygon points={areaPath} fill="url(#batteryGrad)" />
                      {/* Smooth Trend Line */}
                      <polyline points={linePath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      
                      {/* Hover / Point Circles */}
                      {points.map((p, index) => (
                        <g key={index} className="group/dot">
                          <circle 
                            cx={p.x} 
                            cy={p.y} 
                            r="2.5" 
                            fill="#10b981" 
                            stroke="#ffffff" 
                            strokeWidth="1"
                            className="cursor-pointer hover:r-4 transition-all" 
                          />
                          {/* Tooltip for points */}
                          <text 
                            x={p.x} 
                            y={p.y - 8} 
                            fill="#10b981" 
                            fontSize="9" 
                            fontWeight="extrabold" 
                            textAnchor="middle" 
                            className="opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none"
                          >
                            {p.val}%
                          </text>
                        </g>
                      ))}
                    </g>
                  );
                })()}
              </svg>
            ) : (
              <div className="text-slate-500 text-xs">
                Không đủ dữ liệu lịch sử bay cho drone được chọn để tạo biểu đồ.
              </div>
            )}
          </div>
          <div className="flex justify-between items-center text-xs text-slate-450 font-medium mt-2.5 px-2">
            <span>Bắt đầu phiên bay</span>
            <span>Giảm dần theo thời gian Telemetry</span>
            <span>Kết thúc phiên bay</span>
          </div>
        </div>

      </div>

      {/* TIER 3: DRONE DETAIL TABLE */}
      <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-lg overflow-x-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-slate-350 text-sm font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-3 bg-amber-500 rounded"></span> Bảng chi tiết phi đội (Drone Detail Table)
          </h3>
          <span className="text-xs font-semibold text-slate-350 font-mono">Hiển thị {filteredData.length} bản ghi khớp</span>
        </div>
        
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-sm text-slate-200 border-b border-slate-850 uppercase tracking-wider font-extrabold">
              <th className="pb-3.5 pl-2">Drone ID</th>
              <th className="pb-3.5">Nhiệm vụ (Mission)</th>
              <th className="pb-3.5 text-center">Khuyến nghị AI</th>
              <th className="pb-3.5 text-center">Độ tin cậy</th>
              <th className="pb-3.5 text-center">Mức pin</th>
              <th className="pb-3.5 text-center">Tốc độ gió (m/s)</th>
              <th className="pb-3.5 text-center">Khoảng cách (m)</th>
              <th className="pb-3.5">Lý do rủi ro</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {filteredData.slice(0, 100).map((row, idx) => {
              const isSelected = selectedDroneId === row.Drone_ID;
              return (
                <tr 
                  key={idx} 
                  onClick={() => setSelectedDroneId(row.Drone_ID)}
                  className={`border-b border-slate-850/60 hover:bg-slate-850/50 cursor-pointer transition ${
                    isSelected ? 'bg-slate-850/70 border-l-2 border-l-amber-500' : ''
                  } ${
                    row.DSS_Recommendation === 'Return to Base' ? 'bg-red-500/5' : 
                    row.DSS_Recommendation === 'Delay Mission' ? 'bg-amber-500/5' : ''
                  }`}
                >
                  <td className="py-4 pl-2 text-sm font-extrabold text-white flex items-center gap-1.5">
                    <Navigation size={13} className={isSelected ? 'text-amber-500 animate-pulse' : 'text-slate-400'} />
                    {row.Drone_ID || 'Unknown'}
                  </td>
                  <td className="py-4 text-xs text-slate-200 font-mono font-semibold">{row.mission_id || 'N/A'}</td>
                  <td className="py-4 text-center">
                    <span className={`px-2.5 py-1 rounded text-xs font-extrabold ${
                      row.DSS_Recommendation === 'Return to Base' ? 'bg-red-500/10 text-red-400 border border-red-900/30' :
                      row.DSS_Recommendation === 'Delay Mission' ? 'bg-amber-500/10 text-amber-400 border border-amber-900/30' :
                      'bg-emerald-500/10 text-emerald-450 border border-emerald-900/30'
                    }`}>
                      {row.DSS_Recommendation}
                    </span>
                  </td>
                  <td className="py-4 text-center font-bold text-slate-100 text-sm">
                    {row.Confidence_Score ? (row.Confidence_Score * 100).toFixed(1) : '100.0'}%
                  </td>
                  <td className="py-4">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-12 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div className={`h-full ${row.battery_level_pct < 20 ? 'bg-red-500' : row.battery_level_pct < 45 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${row.battery_level_pct}%` }}></div>
                      </div>
                      <span className="text-sm font-bold text-slate-200">{row.battery_level_pct}%</span>
                    </div>
                  </td>
                  <td className="py-4 text-center font-bold text-slate-200 text-sm">
                    {row.wind_speed_mps ? row.wind_speed_mps.toFixed(2) : '0.00'}
                  </td>
                  <td className="py-4 text-center font-bold text-slate-200 text-sm">
                    {row.distance_to_base_m}
                  </td>
                  <td className="py-4 text-slate-250 text-xs font-medium">{row.Risk_Factor}</td>
                </tr>
              );
            })}
            
            {filteredData.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-500">
                  Không có dữ liệu phù hợp với bộ lọc hiện tại. Hãy thử tìm kiếm hoặc lọc từ slicer khác.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        
        {filteredData.length > 100 && (
          <div className="text-center py-3 text-xs text-slate-500 border-t border-slate-850">
            Hiển thị tối đa 100 dòng bản ghi trên bảng để giữ hiệu năng tải trang.
          </div>
        )}
      </div>

    </div>
  );
}
