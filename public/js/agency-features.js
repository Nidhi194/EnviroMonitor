document.addEventListener("DOMContentLoaded", () => {
    // 1. Radial Gauges Animation
    const progressCircles = document.querySelectorAll('.radial-progress');
    const PI2_R = 125.6; // ~ 2 * PI * 20

    setTimeout(() => {
        progressCircles.forEach(circle => {
            const percentage = parseFloat(circle.getAttribute('data-percentage')) || 0;
            // offset calculates what's NOT filled
            const offset = PI2_R - (percentage / 100) * PI2_R;
            circle.style.strokeDashoffset = offset;
        });
    }, 300); // Slight delay for the cool animation effect on load

    // 2. Sparkline Logic
    window.initSparklines = function() {
        const sparklines = document.querySelectorAll('.sparkline-canvas');
        if (sparklines.length > 0 && typeof Chart !== 'undefined') {
            const commonOptions = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        intersect: false,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleFont: { size: 10 },
                        bodyFont: { size: 10 }
                    }
                },
                scales: {
                    x: { display: false },
                    y: { display: false }
                },
                elements: {
                    line: { tension: 0.4, borderWidth: 2 },
                    point: { radius: 0, hitRadius: 8, hoverRadius: 4 }
                },
                layout: { padding: 0 }
            };

            sparklines.forEach((canvas, index) => {
                if (canvas.dataset.chartInitialized) return;
                canvas.dataset.chartInitialized = 'true';

                const ctx = canvas.getContext('2d');
                const grad = ctx.createLinearGradient(0, 0, 0, 32);
                
                // Alternate between blue and emerald
                const isBlue = index % 2 === 0;
                const baseColor = isBlue ? '#0284c7' : '#059669';
                const gradStart = isBlue ? 'rgba(14, 165, 233, 0.4)' : 'rgba(5, 150, 105, 0.4)';
                const gradEnd = isBlue ? 'rgba(14, 165, 233, 0)' : 'rgba(5, 150, 105, 0)';

                grad.addColorStop(0, gradStart);
                grad.addColorStop(1, gradEnd);

                // Mock data for variation
                const baseData = isBlue ? [12, 14, 25, 22, 38, 45, 41] : [50, 48, 45, 46, 38, 30, 28];
                const data = baseData.map(v => v + Math.floor(Math.random() * 10 - 5));

                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
                        datasets: [{
                            data: data,
                            borderColor: baseColor,
                            backgroundColor: grad,
                            fill: true
                        }]
                    },
                    options: commonOptions
                });
            });
        }
    };

    window.initSparklines();
});
