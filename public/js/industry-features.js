document.addEventListener("DOMContentLoaded", () => {
    // 1. Interactive Target Slider Logic
    const slider = document.getElementById("reductionSlider");
    const sliderVal = document.getElementById("sliderValue");
    const aiText = document.getElementById("aiInsightText");
    const aiBox = document.querySelector(".ai-insight-box");
    
    if (slider) {
        slider.addEventListener("input", (e) => {
            const reduction = parseInt(e.target.value);
            sliderVal.innerText = reduction + "%";
            
            // If we have window.aqiChart injected from aqi-chart.js
            if(window.aqiChart) {
                // Baseline predictive data
                const originalPrediction = 235;
                const newPrediction = originalPrediction * (1 - (reduction / 100));
                
                window.aqiChart.data.datasets[1].data[6] = newPrediction;
                window.aqiChart.update();
                
                // Update AI Widget text
                if (reduction < 15) {
                    aiBox.style.color = "#be123c"; // Red
                    aiBox.style.background = "linear-gradient(135deg, rgba(225, 29, 72, 0.15), rgba(225, 29, 72, 0.05))";
                    aiBox.style.borderColor = "rgba(225, 29, 72, 0.3)";
                    aiText.innerText = `⚠️ Prediction: AQI spikes to ${Math.round(newPrediction)}. Recommendation: Reduce plant output by at least 15% to remain compliant.`;
                } else {
                    aiBox.style.color = "#059669"; // Green
                    aiBox.style.background = "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))";
                    aiBox.style.borderColor = "rgba(16, 185, 129, 0.3)";
                    aiText.innerText = `✅ Safe Zone: AQI drops to ${Math.round(newPrediction)}. Your simulated reduction brings emissions within optimal compliance levels.`;
                }
            }
        });
    }

    // 2. Master Compliance Gauge Animation
    setTimeout(() => {
        const gauge = document.querySelector('.gauge-val');
        if (gauge) {
            gauge.style.strokeDashoffset = "40"; // Animates to the 185 score equivalent visually
        }
    }, 400); // Slight delay for aesthetic pop
});
