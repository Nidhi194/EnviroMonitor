document.addEventListener("DOMContentLoaded", () => {
    const ctx = document.getElementById('aqiChart');
    if (!ctx) return;

    // Gradient for the historical data
    const gradientHistorical = ctx.getContext('2d').createLinearGradient(0, 0, 0, 320);
    gradientHistorical.addColorStop(0, 'rgba(14, 165, 233, 0.4)'); // brand-700 sky blue
    gradientHistorical.addColorStop(1, 'rgba(14, 165, 233, 0.01)');

    // Gradient for predictive data (warming / danger)
    const gradientPredictive = ctx.getContext('2d').createLinearGradient(0, 0, 0, 320);
    gradientPredictive.addColorStop(0, 'rgba(244, 63, 94, 0.4)'); // accent red/rose
    gradientPredictive.addColorStop(1, 'rgba(244, 63, 94, 0.01)');

    // Common styling
    Chart.defaults.font.family = "'Outfit', 'Manrope', sans-serif";
    Chart.defaults.color = '#064e3b';

    window.aqiChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar (Current)', 'Apr (Predicted)'],
            datasets: [
                {
                    label: 'Recorded AQI',
                    data: [82, 88, 105, 130, 155, 185, null],
                    borderColor: '#0284c7',
                    backgroundColor: gradientHistorical,
                    borderWidth: 3,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#0284c7',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'AI Forecast',
                    data: [null, null, null, null, null, 185, 235],
                    borderColor: '#f43f5e',
                    backgroundColor: gradientPredictive,
                    borderWidth: 3,
                    borderDash: [6, 6],
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#f43f5e',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 20,
                        font: {
                            weight: '700'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(2, 44, 34, 0.85)',
                    titleColor: '#ffffff',
                    bodyColor: '#e2e8f0',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    titleFont: { size: 14, weight: '700' },
                    bodyFont: { size: 13 }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.3)',
                        drawBorder: false
                    },
                    ticks: {
                        font: { weight: '600' }
                    }
                },
                y: {
                    min: 50,
                    max: 300,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.3)',
                        drawBorder: false,
                        borderDash: [5, 5]
                    },
                    ticks: {
                        font: { weight: '600' },
                        callback: function(value) {
                            return value + ' AQI';
                        }
                    }
                }
            }
        }
    });
});
