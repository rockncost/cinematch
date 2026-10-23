/**
 * CineMatch Fire TV Audio Synthesizer (Web Audio API)
 * Lightweight, zero-asset audio feedback for Fire TV remote navigation.
 */

class SoundFX {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // Remote D-Pad focus change click
    playFocus() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.04);

            gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.04);
        } catch (e) {}
    }

    // Selection confirmation beep
    playSelect() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
            osc.frequency.setValueAtTime(880, this.ctx.currentTime + 0.05); // A5

            gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.12);
        } catch (e) {}
    }

    // Match found celebration fanfare
    playSuccess() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        try {
            const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.07);

                gain.gain.setValueAtTime(0, this.ctx.currentTime + idx * 0.07);
                gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + idx * 0.07 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.07 + 0.35);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(this.ctx.currentTime + idx * 0.07);
                osc.stop(this.ctx.currentTime + idx * 0.07 + 0.35);
            });
        } catch (e) {}
    }
}

window.soundFX = new SoundFX();
