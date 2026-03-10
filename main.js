document.addEventListener('DOMContentLoaded', () => {
    const generatorBtn = document.getElementById('generator-btn');
    const lottoNumbersDiv = document.getElementById('lotto-numbers');
    const themeToggle = document.getElementById('theme-toggle');
    
    // Theme toggle logic
    const initTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggle.textContent = '화이트 모드';
        } else {
            document.body.classList.remove('dark-mode');
            themeToggle.textContent = '다크 모드';
        }
    };

    themeToggle.addEventListener('click', () => {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        if (isDarkMode) {
            localStorage.setItem('theme', 'dark');
            themeToggle.textContent = '화이트 모드';
        } else {
            localStorage.setItem('theme', 'light');
            themeToggle.textContent = '다크 모드';
        }
    });

    // Initialize theme
    initTheme();

    // Lotto generator logic
    generatorBtn.addEventListener('click', () => {
        lottoNumbersDiv.innerHTML = ''; // Clear previous numbers
        
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
            }, index * 100); // Staggered animation effect
        });
    });
});