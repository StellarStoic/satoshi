// confettiLotteryWin.js
class ConfettiLotteryWin {
    constructor() {
        this.confetti = window.confetti;
        this.ensureConfettiCanvas();
    }

    // Ensure confetti canvas has proper z-index
    ensureConfettiCanvas() {
        // This runs after confetti creates its canvas
        setTimeout(() => {
            const canvas = document.querySelector('canvas');
            if (canvas) {
                canvas.style.zIndex = '99999';
                canvas.style.position = 'fixed';
                canvas.style.pointerEvents = 'none';
            }
        }, 100);
    }

    // Trigger confetti for winning tickets
    triggerWinCelebration(winCount, tierLevel = 1) {
        if (!this.confetti) {
            console.warn('Confetti library not loaded');
            return;
        }

        // First, ensure canvas is on top
        this.ensureConfettiCanvas();

        console.log(`🎉 Celebrating ${winCount} win(s) at tier ${tierLevel}!`);

        // Different confetti effects based on tier level
        switch(tierLevel) {
            case 1: // Jackpot - Biggest celebration
                this.triggerJackpotConfetti(winCount);
                break;
            case 2: // Major win
                this.triggerMajorWinConfetti(winCount);
                break;
            default: // Regular win
                this.triggerRegularWinConfetti(winCount);
                break;
        }
    }

    // Jackpot celebration (Tier 1)
    triggerJackpotConfetti(winCount) {
        const duration = 5000;
        const end = Date.now() + duration;

        // Multiple bursts for jackpot
        const frame = () => {
            // Launch from left edge
            this.confetti({
                particleCount: 100,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                zIndex: 99999
            });

            // Launch from right edge
            this.confetti({
                particleCount: 100,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                zIndex: 99999
            });

            // Center burst
            this.confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 },
                zIndex: 99999
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        };

        frame();

        // Additional effects for multiple wins
        if (winCount > 1) {
            setTimeout(() => {
                this.confetti({
                    particleCount: 200,
                    spread: 360,
                    startVelocity: 45,
                    shapes: ['circle', 'square'],
                    colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
                    zIndex: 99999
                });
            }, 1000);
        }
    }

    // Major win celebration (Tier 2-3)
    triggerMajorWinConfetti(winCount) {
        const duration = 3000;
        const end = Date.now() + duration;

        const frame = () => {
            this.confetti({
                particleCount: 80,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                zIndex: 99999
            });

            this.confetti({
                particleCount: 80,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                zIndex: 99999
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        };

        frame();

        // Center burst
        setTimeout(() => {
            this.confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                zIndex: 99999
            });
        }, 500);
    }

    // Regular win celebration (Tier 4-6)
    triggerRegularWinConfetti(winCount) {
        // Single burst for regular wins
        this.confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            zIndex: 99999
        });

        // Additional burst for multiple wins
        if (winCount > 1) {
            setTimeout(() => {
                this.confetti({
                    particleCount: 50,
                    spread: 50,
                    origin: { y: 0.6 },
                    zIndex: 99999
                });
            }, 500);
        }
    }

    // Simple confetti for any win
    triggerSimpleConfetti() {
        this.confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            zIndex: 99999
        });
    }

    // Fireworks effect
    triggerFireworks() {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            
            // Since particles fall down, start a bit higher than random
            confetti(Object.assign({}, defaults, {
                particleCount,
                origin: { x: Math.random(), y: Math.random() - 0.2 }
            }));
        }, 250);
    }

    // School pride effect
    triggerSchoolPride() {
        const end = Date.now() + 3000;
        const colors = ['#bb0000', '#ffffff'];

        (function frame() {
            confetti({
                particleCount: 2,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: colors,
                zIndex: 99999
            });
            confetti({
                particleCount: 2,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: colors,
                zIndex: 99999
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());
    }
}

// Create global instance
window.lotteryConfetti = new ConfettiLotteryWin();