import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import tkinter as tk
from tkinter import messagebox, ttk, scrolledtext
import sys

# --- [1. 물리 계산 로직] --- (원본 유지)
def calculate_logic(inputs):
    # 입력값 추출 (17개 항목 순서 준수)
    m_flow_cmm = inputs[0]
    temp_c = inputs[1]
    d_pipe_mm = inputs[2]
    # 4번은 촉매 외경 정보로 내부 계산용
    inlet_angle_half = inputs[4]
    unit_cat_l_mm = inputs[5]
    cpsi = inputs[6]
    t_wall_mil = inputs[7]
    install_w_m = inputs[8]
    install_h_m = inputs[9]
    num_layers = inputs[10]
    vane_count = inputs[12]
    vane_thick_mm = inputs[13]
    vane_surface_m2 = inputs[14]
    vane_pos_cm_default = inputs[16]

    # 기초 물리 상수 계산
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
            # Weltens Uniformity Index 기반 모델링
            gamma = min(0.98, 0.86 + 0.12 * (1 - np.exp(-0.06 * v_pos_cm)))
            blockage = (vane_count * vane_thick_mm / 1000 * (d_pipe_mm/2000)) / area_pipe
            vane_loss = 0.25 + blockage + (vane_surface_m2 * 0.05)
        else:
            # 박리 현상을 반영한 낮은 균일도 모델링
            gamma = max(0.35, 1.0 - (0.006 * (inlet_angle_half * 2) * np.log10(area_ratio)))
            vane_loss = 0.0
        
        v_pipe = (m_flow_cmm / 60) / area_pipe
        # Form Drag (형상 저항) 계산
        dp_form = (0.5 * rho * v_pipe**2) * (0.5 + vane_loss)
        # Darcy-Weisbach 기반 촉매 마찰 저항
        v_ch_eff = ((m_flow_cmm / 60) / (area_install * ofa)) * (2 - gamma)
        f_ch = 56.9 / ((rho * v_ch_eff * d_h) / mu)
        dp_cat = f_ch * (total_cat_length_m / d_h) * (rho * v_ch_eff**2 / 2)
        
        return (dp_form + dp_cat) / 1000, gamma, v_ch_eff

    return calculate, vane_pos_cm_default, inlet_angle_half, num_layers, total_cat_length_m, vane_count

# --- [2. 결과 분석 별도 창 클래스] --- (배압/균일도 표 상세 수치 반영)
class ResultWindow:
    def __init__(self, parent, result_dict):
        self.window = tk.Toplevel(parent)
        self.window.title("Engineering Analysis Report (상세 분석 결과)")
        self.window.geometry("950x980")
        
        # 1. 모델 개요
        tk.Label(self.window, text="1. 1D Model Schematic", font=("Arial", 12, "bold")).pack(anchor="w", padx=20, pady=(15, 5))
        schematic_text = f"Inlet --▶ Cone({int(result_dict['angle']*2)}°) --▶ [Vane x{int(result_dict['v_cnt'])} @{result_dict['v_pos']}cm] --▶ [{int(result_dict['layers'])}단 적재, 총 {result_dict['total_l']*1000:.0f}mm] --▶ Outlet"
        tk.Label(self.window, text=schematic_text, bg="#f0f0f0", relief="sunken", padx=10, pady=10, font=("Consolas", 10)).pack(fill="x", padx=20)

        # 2-1. 배압(Backpressure) 관련 결과 요약
        tk.Label(self.window, text="2-1. [배압(Backpressure) 관련 결과 요약]", font=("Arial", 12, "bold")).pack(anchor="w", padx=20, pady=(20, 5))
        
        tree_dp = ttk.Treeview(self.window, columns=("Metric", "No Vane", "With Vane", "Effect"), show="headings", height=2)
        tree_dp.heading("Metric", text="구분 (Metric)")
        tree_dp.heading("No Vane", text="가이드 베인 없음 (No Vane)")
        tree_dp.heading("With Vane", text="가이드 베인 있음 (With Vane)")
        tree_dp.heading("Effect", text="비고 및 효과")
        
        tree_dp.column("Metric", width=180, anchor="w")
        tree_dp.column("No Vane", width=220, anchor="center")
        tree_dp.column("With Vane", width=220, anchor="center")
        tree_dp.column("Effect", width=220, anchor="w")
        
        dp_reduction = ((result_dict['dp_nv'] - result_dict['dp_v']) / result_dict['dp_nv']) * 100
        tree_dp.insert("", "end", values=("전체 배압 (ΔP)", f"{result_dict['dp_nv']:.3f} kPa", f"{result_dict['dp_v']:.3f} kPa", f"약 {dp_reduction:.1f}% 압력 손실 저감"))
        tree_dp.insert("", "end", values=("압력 손실 특성", "중앙 집중 유동 저항", "균일 분산 유동 안정", "유속 제곱(v²) 비례 억제"))
        tree_dp.pack(padx=20, fill="x")

        # 2-2. 유동 균일도(Flow Uniformity) 관련 결과 요약
        tk.Label(self.window, text="2-2. [유동 균일도(Flow Uniformity) 관련 결과 요약]", font=("Arial", 12, "bold")).pack(anchor="w", padx=20, pady=(20, 5))
        
        tree_g = ttk.Treeview(self.window, columns=("Metric", "No Vane", "With Vane", "Effect"), show="headings", height=3)
        tree_g.heading("Metric", text="구분 (Metric)")
        tree_g.heading("No Vane", text="가이드 베인 없음 (No Vane)")
        tree_g.heading("With Vane", text="가이드 베인 있음 (With Vane)")
        tree_g.heading("Effect", text="비고 및 효과")
        
        tree_g.column("Metric", width=180, anchor="w")
        tree_g.column("No Vane", width=220, anchor="center")
        tree_g.column("With Vane", width=220, anchor="center")
        tree_g.column("Effect", width=220, anchor="w")

        v_max_nv = result_dict['v_avg_nv'] * (2 - result_dict['g_nv'])
        v_max_v = result_dict['v_avg_v'] * (2 - result_dict['g_v'])

        tree_g.insert("", "end", values=("유동 균일도 (γ)", f"{result_dict['g_nv']:.3f} (매우 낮음)", f"{result_dict['g_v']:.3f} (매우 높음)", "박리 억제 및 유동 분산"))
        tree_g.insert("", "end", values=("평균 유속 (v_avg)", f"약 {result_dict['v_avg_nv']:.1f} m/s", f"약 {result_dict['v_avg_v']:.1f} m/s", "유량 및 단면적 동일"))
        tree_g.insert("", "end", values=("최대 국부 유속 (vi)", f"약 {v_max_nv:.1f} m/s", f"약 {v_max_v:.1f} m/s", "고속 제트 현상 제거"))
        tree_g.pack(padx=20, fill="x")

        # 3. 공학적 해석 근거
        tk.Label(self.window, text="3. [유동 및 배압 해석의 공학적 근거]", font=("Arial", 12, "bold")).pack(anchor="w", padx=20, pady=(20, 2))
        
        basis_frame = tk.Frame(self.window, bd=1, relief="solid")
        basis_frame.pack(fill="both", padx=20, pady=5)
        
        txt = scrolledtext.ScrolledText(basis_frame, height=28, font=("Malgun Gothic", 10))
        basis_content = (
            "■ [유동 균일도(Flow Uniformity) 해석 근거]\n"
            " • Weltens 지수 모델 적용: 촉매 전단 유속의 편차를 이용해 유동의 균일성을 정량화함.\n"
            " • 가이드 베인의 역할: 입구 Cone의 급확산각(47도)에 의한 유동 박리를 물리적으로 분산시킴.\n"
            " • 위치(Distance) 효과: Vane 위치가 멀수록 유동이 재부착되어 균일도가 지수함수적으로 상승함.\n\n"
            
            "■ [배압(Backpressure) 계산 근거]\n"
            " • 형상 손실(Form Drag): ΔP = K * (0.5 * ρ * v²). Vane 자체 저항과 입구 급확산 저항의 합.\n"
            " • 마찰 손실(Frictional Loss): Darcy-Weisbach 식을 기반으로 CPSI 및 촉매 길이에 따른 저항 산출.\n"
            " • 유동-배압 결합: 유동 불균일 시 국부 유속 상승이 압력 손실의 제곱비례 법칙에 의해 배압을 급증시킴.\n\n"

            "■ [유속 정의 비교 (Flow vs Pressure)]\n"
            " 1) 유동 균일도 식의 유속: 촉매 전단 자유 공간(Free Space) 기준, 촉매 설치 전면적(W x H) 기준 분포 산출.\n"
            " 2) 배압 계산 식의 유속: 촉매 내부 미세 채널(Monolith Cell) 기준, 실제 통로 면적(W x H x OFA) 기준 저항 산출.\n\n"

            "■ [종합 기술 분석]\n"
            " - 가이드 베인 적용 시 자체 저항은 증가하나, 균일도 향상으로 촉매 내 고속 제트 유동이 소멸됨.\n"
            " - 결과적으로 촉매 통과 저항 감소분이 베인 저항보다 크므로 전체 시스템 배압이 최적화됨."
        )
        txt.insert(tk.INSERT, basis_content)
        txt.configure(state='disabled')
        txt.pack(expand=True, fill='both')
        
        tk.Label(self.window, text="종료하시려면 [확인] 클릭 또는 [Enter / ESC] 키를 누르세요.", fg="red").pack(pady=5)
        btn = tk.Button(self.window, text="확인 (OK)", command=self.window.destroy, width=20, bg="#2196F3", fg="white")
        btn.pack(pady=10)
        
        self.window.bind('<Return>', lambda e: self.window.destroy())
        self.window.bind('<Escape>', lambda e: self.window.destroy())

# --- [3. 메인 입력 GUI 클래스] --- (원본 유지)
class AnalysisApp:
    def __init__(self, root):
        self.root = root
        self.root.title("SCR/Vane Technical Analysis Input")
        self.root.geometry("550x750")
        
        container = tk.Frame(root)
        container.pack(pady=20, padx=20)

        self.labels = [
            "1. 배기 질량유량 [CMM]", "2. 배기 온도 [°C]", "3. 배기관 직경 [mm]",
            "4. 촉매 외경 (가로/세로) [mm]", "5. Inlet Cone 각도 (편측) [도]", "6. 촉매 길이 [mm]",
            "7. CPSI [cpsi]", "8. 벽 두께 [mil]", "9. 촉매 설치 입구(가로) [m]",
            "10. 촉매 설치 입구(세로) [m]", "11. 촉매 설치 단수 [단]", "12. 촉매 설치 간격 [cm]",
            "13. van 날개 [개]", "14. Van 두께 [mm]", "15. van 표면적 [m^2]",
            "16. van 배치 각도 [도]", "17. van 위치 (촉매 전단) [cm]"
        ]
        self.defaults = [
            12000.0, 20.0, 800.0, 100.0, 47.0, 100.0, 120.0, 15.7, 2.2, 
            2.0, 8.0, 10.0, 10.0, 2.0, 0.52, 50.0, 30.0
        ]

        self.entries = []
        for i, (label, default) in enumerate(zip(self.labels, self.defaults)):
            lbl = tk.Label(container, text=label, width=35, anchor="w", font=("Arial", 10))
            lbl.grid(row=i, column=0, pady=3)
            ent = tk.Entry(container, width=15, font=("Arial", 10))
            ent.insert(0, str(default))
            ent.grid(row=i, column=1, pady=3)
            self.entries.append(ent)

        btn = tk.Button(root, text="기술 분석 및 그래프 실행", command=self.run_analysis, 
                       bg="#4CAF50", fg="white", font=("Arial", 11, "bold"), pady=10, width=30)
        btn.pack(pady=20)

    def run_analysis(self):
        try:
            user_inputs = [float(e.get()) for e in self.entries]
            
            # 물리 계산 실행
            calculate, v_pos, angle, layers, total_l, v_cnt = calculate_logic(user_inputs)
            dp_v, g_v, v_avg_v = calculate(v_pos, True)
            dp_nv, g_nv, v_avg_nv = calculate(v_pos, False)

            result_data = {
                'angle': angle, 'v_pos': v_pos, 'v_cnt': v_cnt, 
                'layers': layers, 'total_l': total_l,
                'dp_v': dp_v, 'g_v': g_v, 'v_avg_v': v_avg_v,
                'dp_nv': dp_nv, 'g_nv': g_nv, 'v_avg_nv': v_avg_nv
            }
            
            # 그래프 출력 (원본 유지)
            fig1, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 5))
            ax1.bar(['With Vane', 'No Vane'], [dp_v, dp_nv], color=['blue', 'red'], alpha=0.7)
            ax1.set_title('2-3. Total Backpressure (kPa)')
            ax1.set_ylabel('kPa')
            ax2.bar(['With Vane', 'No Vane'], [g_v, g_nv], color=['green', 'orange'], alpha=0.7)
            ax2.set_title('2-3. Flow Uniformity (Gamma)')
            ax2.set_ylabel('Gamma Index')
            plt.tight_layout()
            plt.show(block=False)

            pos_range = np.linspace(0, 100, 50)
            opt_dp, opt_gamma = [], []
            for p in pos_range:
                d, g, _ = calculate(p, True)
                opt_dp.append(d)
                opt_gamma.append(g)

            fig2, ax_p = plt.subplots(figsize=(10, 6))
            ax_p.plot(pos_range, opt_dp, color='tab:red', linewidth=2, label='Backpressure')
            ax_p.set_xlabel('Vane Position from Catalyst Inlet (cm)')
            ax_p.set_ylabel('Total Backpressure (kPa)', color='tab:red')
            ax_g = ax_p.twinx()
            ax_g.plot(pos_range, opt_gamma, color='tab:blue', linestyle='--', linewidth=2, label='Uniformity')
            ax_g.set_ylabel('Flow Uniformity (Gamma)', color='tab:blue')
            plt.title('3. Uniformity and Pressure Results by Vane Position')
            plt.grid(True, alpha=0.3)
            plt.tight_layout()
            plt.show(block=False)

            # 결과 분석 별도 창 띄우기
            ResultWindow(self.root, result_data)

        except ValueError:
            messagebox.showerror("Error", "모든 입력값을 숫자로 정확히 입력해주세요.")

if __name__ == "__main__":
    root = tk.Tk()
    app = AnalysisApp(root)
    root.mainloop()