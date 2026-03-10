// 1. 초기 테마 설정 (스크립트 로드 시 즉시 실행)
(function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark-mode');
        // body 대신 documentElement에 클래스를 추가하여 더 안정적으로 작동하게 함
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    const generatorBtn = document.getElementById('generator-btn');
    const lottoNumbersDiv = document.getElementById('lotto-numbers');
    const themeToggle = document.getElementById('theme-toggle');
    
    // 2. 버튼 텍스트 업데이트 함수
    const updateButtonText = () => {
        const isDark = document.documentElement.classList.contains('dark-mode');
        themeToggle.textContent = isDark ? '화이트 모드' : '다크 모드';
    };

    // 초기 텍스트 설정
    updateButtonText();

    // 3. 테마 토글 버튼 클릭 시
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        updateButtonText();
    });

    // 4. 로또 번호 생성 로직
    generatorBtn.addEventListener('click', () => {
        lottoNumbersDiv.innerHTML = ''; 
        
        const numbers = new Set();
        while (numbers.size < 6) {
            numbers.add(Math.floor(Math.random() * 45) + 1);
        }

        const sortedNumbers = Array.from(numbers).sort((a, b) => a - b);

        sortedNumbers.forEach((number, index) => {
            setTimeout(() => {
                const numberDiv = document.createElement('div');
                numberDiv.classList.add('lotto-number');
                numberDiv.textContent = number;
                lottoNumbersDiv.appendChild(numberDiv);
            }, index * 100);
        });
    });
});