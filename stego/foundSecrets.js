// foundSecrets.js – Trigger optimized sparkle effect with varying brightness
function triggerSparkleEffect() {
    const duration = 7000; // 4 seconds
    const numSparkles = 80; // Reduced number to save resources

    for (let i = 0; i < numSparkles; i++) {
        const sparkle = document.createElement('div');
        sparkle.classList.add('sparkle');

        // Randomize position
        sparkle.style.top = Math.random() * window.innerHeight + 'px';
        sparkle.style.left = Math.random() * window.innerWidth + 'px';

        // Randomize brightness intensity (opacity variation)
        const randomOpacity = (Math.random() * 0.7 + 0.3).toFixed(2); // Between 0.3 and 1
        sparkle.style.setProperty('--sparkle-opacity', randomOpacity);

        // Random delay so sparkles don't all appear at the same time
        const delay = Math.random() * 1000; // Up to 1 sec delay
        setTimeout(() => document.body.appendChild(sparkle), delay);
    }

    // Remove sparkles after animation duration
    setTimeout(() => {
        document.querySelectorAll('.sparkle').forEach(elem => elem.remove());
    }, duration + 1000); // Allow extra time for late sparkles
}
