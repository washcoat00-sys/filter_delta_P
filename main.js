// 1. 초기 테마 설정
(function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark-mode');
    }
})();

// 전역 모드 전환 함수
function switchMode(mode) {
    const deltapTab = document.getElementById('tab-deltap');
    const flowTab = document.getElementById('tab-flow');
    const deltapContent = document.getElementById('deltap-content');
    const flowContent = document.getElementById('flow-content');

    if (mode === 'deltap') {
        deltapTab.classList.add('active');
        flowTab.classList.remove('active');
        deltapContent.style.display = 'grid';
        flowContent.style.display = 'none';
    } else {
        flowTab.classList.add('active');
        deltapTab.classList.remove('active');
        flowContent.style.display = 'grid';
        deltapContent.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // --- [공통 요소] ---
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });

    // --- [차압 분석 로직] --- (기존 유지)
    const analyzeBtn = document.getElementById('analyze-btn');
    const graphBtn = document.getElementById('graph-btn');
    const resultsContent = document.getElementById('results-content');
    const resP1 = document.getElementById('res-p1');
    let myChart = null;

    function getDP(d, soot_gL, ash_gL) {
        const tortuosity = 1.8;
        const k1_internal = 0.4;
        const amb_pa = d.amb_kpa * 1000.0;
        const porosity = d.porosity_pct / 100.0;
        const w_m = d.width_mm / 1000, h_m = d.height_mm / 1000, l_m = d.depth_mm / 1000;
        const t_kelvin = d.temp_c + 273.15;
        const rho_air = amb_pa / (287.05 * t_kelvin);
        const mu = 1.81e-5 * Math.pow((t_kelvin / 293.15), 1.5) * ((293.15 + 110.4) / (t_kelvin + 110.4));
        const cms = d.cmm / 60.0;
        const volume_m3 = w_m * h_m * l_m;
        const a_eff = volume_m3 * (2800 * (Math.sqrt(d.cpsi) / Math.sqrt(400)));
        const kappa_clean = (Math.pow(d.pore_size_um * 1e-6, 2) * Math.pow(porosity, 3)) / (180 * Math.pow(1 - porosity, 2)) / tortuosity;
        const reduction_factor = Math.exp(-k1_internal * (soot_gL + ash_gL));
        const kappa_effective = kappa_clean * reduction_factor;
        const v_wall = cms / a_eff;
        const dp_wall = (mu * v_wall * (d.wall_mil * 0.0000254)) / kappa_effective;
        const total_load_kg = ((soot_gL + ash_gL) * (volume_m3 * 1000)) / 1000;
        const cake_thick = total_load_kg / (100.0 * a_eff);
        const dp_cake = cake_thick > 0 ? (mu * v_wall * cake_thick) / parseFloat(d.k2) : 0;
        const area_dpf = w_m * h_m;
        const area_pipe = Math.PI * Math.pow(d.pipe_dia_mm / 2000, 2);
        const v_pipe = cms / area_pipe;
        const angle_rad = d.cone_angle_deg * (Math.PI / 180);
        const k_contraction = 0.5 * Math.sin(angle_rad / 2);
        const dp_exit = (k_contraction + 1.0) * 0.5 * rho_air * Math.pow(v_pipe, 2);
        const dp_housing_in = 0.5 * 0.5 * rho_air * Math.pow(cms / area_dpf, 2);
        return dp_wall + dp_cake + dp_exit + dp_housing_in;
    }

    function getInputs() {
        const ids = [
            'weight_clean', 'weight_soot_loaded', 'weight_after_regen',
            'cmm', 'temp_c', 'amb_kpa', 'width_mm', 'height_mm', 'depth_mm',
            'cpsi', 'wall_mil', 'porosity_pct', 'pore_size_um', 
            'pipe_dia_mm', 'cone_len_mm', 'cone_angle_deg'
        ];
        const data = {};
        for (const id of ids) {
            const el = document.getElementById(id);
            if (!el) return null;
            const val = parseFloat(el.value);
            if (isNaN(val)) return null;
            data[id] = val;
        }
        const k2El = document.getElementById('k2');
        if (!k2El || isNaN(parseFloat(k2El.value))) return null;
        data['k2'] = k2El.value;
        return data;
    }

    analyzeBtn.addEventListener('click', () => {
        const d = getInputs();
        if (!d) return;
        const vol_L = (d.width_mm * d.height_mm * d.depth_mm) / 1e6;
        const curr_ash_gL = Math.max(0, (d.weight_after_regen - d.weight_clean) * 1000) / vol_L;
        const curr_soot_gL = Math.max(0, (d.weight_soot_loaded - d.weight_after_regen) * 1000) / vol_L;
        const getInfo = (s, a) => {
            const dp = getDP(d, s, a) / 1000.0;
            let p2 = d.amb_kpa - dp;
            let status = "";
            if (p2 < 0) { p2 = 0; status = " (🚨 측정불가)"; }
            return { dp, p2, status };
        };
        const states = [
            { title: "Clean State", soot: 0, ash: 0, color: "#00c853" },
            { title: `Current Loading (${curr_soot_gL.toFixed(2)} g/L)`, soot: curr_soot_gL, ash: curr_ash_gL, color: "#0062ff" },
            { title: "After Regen", soot: 0, ash: curr_ash_gL, color: "#ff3d00" }
        ];
        resP1.textContent = d.amb_kpa.toFixed(3);
        resultsContent.innerHTML = '';
        states.forEach((state, index) => {
            const info = getInfo(state.soot, state.ash);
            const card = document.createElement('div');
            card.className = 'result-card';
            card.style.borderLeftColor = state.color;
            card.style.animationDelay = `${index * 0.1}s`; 
            card.innerHTML = `
                <strong style="color:${state.color}">${state.title}</strong>
                <p>ΔP: ${info.dp.toFixed(3)} kPa</p>
                <p>P2: ${info.p2.toFixed(3)} kPa${info.status}</p>
            `;
            resultsContent.appendChild(card);
        });
    });

    graphBtn.addEventListener('click', () => {
        const d = getInputs();
        if (!d) return;
        const vol_L = (d.width_mm * d.height_mm * d.depth_mm) / 1e6;
        const curr_ash_gL = Math.max(0, (d.weight_after_regen - d.weight_clean) * 1000) / vol_L;
        const curr_soot_gL = Math.max(0, (d.weight_soot_loaded - d.weight_after_regen) * 1000) / vol_L;
        const sootRange = [];
        for (let i = 0; i <= 50; i++) sootRange.push(i * 0.2);
        const yClean = sootRange.map(s => getDP(d, s, 0) / 1000.0);
        const yAsh = sootRange.map(s => getDP(d, s, curr_ash_gL) / 1000.0);
        const currDP = getDP(d, curr_soot_gL, curr_ash_gL) / 1000.0;
        if (myChart) myChart.destroy();
        const ctx = document.getElementById('dpfChart').getContext('2d');
        myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sootRange.map(s => s.toFixed(1)),
                datasets: [
                    { label: 'Clean + Exit Loss', data: yClean, borderColor: '#00c853', borderDash: [5, 5], fill: false, tension: 0.4 },
                    { label: `With Ash (${curr_ash_gL.toFixed(2)}g/L)`, data: yAsh, borderColor: '#0062ff', fill: true, backgroundColor: 'rgba(0, 98, 255, 0.05)', tension: 0.4 },
                    { label: 'Current Point', data: [{ x: curr_soot_gL.toFixed(2), y: currDP }], backgroundColor: '#ff3d00', borderColor: '#fff', pointRadius: 8, showLine: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Soot Loading (g/L)' } },
                    y: { beginAtZero: true, title: { display: true, text: 'ΔP (kPa)' } }
                }
            }
        });
    });

    // --- [유동 분석 로직] ---
    let pyodide = null;
    let pyScriptContent = "";
    const pyStatus = document.getElementById('py-status');
    const pyUpload = document.getElementById('py-upload');
    const fileNameDisplay = document.getElementById('file-name');
    const flowParamsContainer = document.getElementById('flow-params-container');
    const runFlowBtn = document.getElementById('run-flow-btn');
    const flowResultsContent = document.getElementById('flow-results-content');
    let flowChart1 = null;
    let flowChart2 = null;

    // 파라미터 그룹화 및 2열 배치를 위한 설정
    const paramGroups = [
        {
            title: "1. 배기 환경 (Exhaust)",
            params: [
                { label: "유량 [CMM]", default: 12000.0 },
                { label: "배기 온도 [°C]", default: 20.0 },
                { label: "배기관 직경 [mm]", default: 800.0 }
            ]
        },
        {
            title: "2. 촉매 제원 (Catalyst)",
            params: [
                { label: "촉매 외경 [mm]", default: 100.0 },
                { label: "Cone 각도 [도]", default: 47.0 },
                { label: "촉매 길이 [mm]", default: 100.0 },
                { label: "CPSI [cpsi]", default: 120.0 },
                { label: "벽 두께 [mil]", default: 15.7 },
                { label: "설치 가로 [m]", default: 2.2 },
                { label: "설치 세로 [m]", default: 2.0 },
                { label: "설치 단수 [단]", default: 8.0 },
                { label: "단간 간격 [cm]", default: 10.0 }
            ]
        },
        {
            title: "3. Vane 설계 (Vane)",
            params: [
                { label: "날개 개수 [개]", default: 10.0 },
                { label: "날개 두께 [mm]", default: 2.0 },
                { label: "날개 표면적 [m^2]", default: 0.52 },
                { label: "배치 각도 [도]", default: 50.0 },
                { label: "전단 위치 [cm]", default: 30.0 }
            ]
        }
    ];

    // 입력창 생성 (그룹별/2열 배치)
    let globalParamIndex = 0;
    paramGroups.forEach((group) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'param-group';
        groupEl.innerHTML = `<div class="param-group-title">${group.title}</div>`;
        
        const grid = document.createElement('div');
        grid.className = 'params-grid';
        
        group.params.forEach((param) => {
            const row = document.createElement('div');
            row.className = 'form-row compact';
            row.innerHTML = `<span>${param.label}</span><input type="number" id="flow_p_${globalParamIndex}" value="${param.default}">`;
            grid.appendChild(row);
            globalParamIndex++;
        });
        
        groupEl.appendChild(grid);
        flowParamsContainer.appendChild(groupEl);
    });

    async function initPyodide() {
        try {
            pyStatus.textContent = "SYSTEM INITIALIZING...";
            pyodide = await loadPyodide();
            await pyodide.loadPackage(['numpy']);
            pyStatus.textContent = "SYSTEM READY";
            pyStatus.style.color = "var(--secondary)";
        } catch (e) { pyStatus.textContent = "ERROR"; }
    }
    initPyodide();

    runFlowBtn.addEventListener('click', async () => {
        if (!pyodide) return;
        const inputs = Array.from({length: 17}, (_, i) => parseFloat(document.getElementById(`flow_p_${i}`).value));
        
        const pythonCode = `
import numpy as np
def calculate_logic(inputs):
    # 입력값 (vane2_thicker.py와 동일한 순서 및 로직)
    m_flow_cmm = inputs[0]
    temp_c = inputs[1]
    d_pipe_mm = inputs[2]
    # inputs[3]은 cat_dia (사용되지 않음)
    inlet_angle_half = inputs[4]
    unit_cat_l_mm = inputs[5]
    cpsi = inputs[6]
    t_wall_mil = inputs[7]
    install_w_m = inputs[8]
    install_h_m = inputs[9]
    num_layers = inputs[10]
    # inputs[11]은 gap
    vane_count = inputs[12]
    vane_thick_mm = inputs[13]
    vane_surface_m2 = inputs[14]
    # inputs[15]은 angle
    vane_pos_cm_default = inputs[16]

    temp_k = temp_c + 273.15
    rho = 101325 / (287.05 * temp_k)
    mu = 1.716e-5 * (temp_k/273.15)**1.5 * (273.15+110.4)/(temp_k+110.4)
    area_pipe = np.pi * (d_pipe_mm/1000)**2 / 4
    area_install = install_w_m * install_h_m
    total_cat_length_m = num_layers * (unit_cat_l_mm / 1000)
    t_wall_m = t_wall_mil * 2.54e-5
    pitch = np.sqrt(1/cpsi) * 0.0254
    d_h = pitch - t_wall_m
    ofa = (d_h / pitch)**2

    def calculate(v_pos_cm, has_vane):
        area_ratio = area_install / area_pipe
        if has_vane:
            gamma = min(0.98, 0.86 + 0.12 * (1 - np.exp(-0.06 * v_pos_cm)))
            blockage = (vane_count * vane_thick_mm / 1000 * (d_pipe_mm/2000)) / area_pipe
            vane_loss = 0.25 + blockage + (vane_surface_m2 * 0.05)
        else:
            gamma = max(0.35, 1.0 - (0.006 * (inlet_angle_half * 2) * np.log10(area_ratio)))
            vane_loss = 0.0
        
        v_pipe = (m_flow_cmm / 60) / area_pipe
        dp_form = (0.5 * rho * v_pipe**2) * (0.5 + vane_loss)
        v_ch_eff = ((m_flow_cmm / 60) / (area_install * ofa)) * (2 - gamma)
        f_ch = 56.9 / ((rho * v_ch_eff * d_h) / mu)
        dp_cat = f_ch * (total_cat_length_m / d_h) * (rho * v_ch_eff**2 / 2)
        return float((dp_form + dp_cat) / 1000), float(gamma), float(v_ch_eff)

    dp_v, g_v, _ = calculate(vane_pos_cm_default, True)
    dp_nv, g_nv, _ = calculate(vane_pos_cm_default, False)
    
    pos_range = np.linspace(0, 100, 20)
    opt_dp, opt_gamma = [], []
    for p in pos_range:
        d, g, _ = calculate(p, True)
        opt_dp.append(d); opt_gamma.append(g)

    return {
        "dp_v": dp_v, "g_v": g_v, 
        "dp_nv": dp_nv, "g_nv": g_nv,
        "opt_pos": pos_range.tolist(), "opt_dp": opt_dp, "opt_gamma": opt_gamma
    }

calculate_logic(${JSON.stringify(inputs)})
`;
        try {
            const res = (await pyodide.runPythonAsync(pythonCode)).toJs({dict_converter: Object.fromEntries});
            displayFlowResults(res);
            drawFlowCharts(res);
        } catch (e) { console.error(e); }
    });

    function displayFlowResults(res) {
        const gain = ((res.dp_nv - res.dp_v) / res.dp_nv * 100).toFixed(1);
        flowResultsContent.innerHTML = `
            <div class="result-card" style="border-left-color: var(--primary)">
                <strong>Backpressure Analysis</strong>
                <p>With Vane: ${res.dp_v.toFixed(3)} kPa</p>
                <p>No Vane: ${res.dp_nv.toFixed(3)} kPa</p>
                <p style="color:var(--secondary); font-weight:700">Improvement: ${gain}%</p>
            </div>
            <div class="result-card" style="border-left-color: var(--secondary)">
                <strong>Flow Uniformity (γ)</strong>
                <p>With Vane: ${res.g_v.toFixed(3)}</p>
                <p>No Vane: ${res.g_nv.toFixed(3)}</p>
            </div>
        `;
    }

    function drawFlowCharts(res) {
        if (flowChart1) flowChart1.destroy();
        if (flowChart2) flowChart2.destroy();
        const ctx1 = document.getElementById('flowChart1').getContext('2d');
        flowChart1 = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: ['With Vane', 'No Vane'],
                datasets: [
                    { label: 'Pressure (kPa)', data: [res.dp_v, res.dp_nv], backgroundColor: ['#0062ff', '#94a3b8'], borderRadius: 6 },
                    { label: 'Gamma (γ)', data: [res.g_v, res.g_nv], backgroundColor: ['#00c853', '#cbd5e1'], borderRadius: 6 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
        const ctx2 = document.getElementById('flowChart2').getContext('2d');
        flowChart2 = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: res.opt_pos.map(p => p.toFixed(0)),
                datasets: [
                    { label: 'Pressure (kPa)', data: res.opt_dp, borderColor: '#ff3d00', yAxisID: 'y', tension: 0.4 },
                    { label: 'Uniformity (γ)', data: res.opt_gamma, borderColor: '#00c853', borderDash: [5, 5], yAxisID: 'y1', tension: 0.4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { type: 'linear', position: 'left', title: { display: true, text: 'Pressure' } },
                    y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Uniformity' } }
                }
            }
        });
    }
});
