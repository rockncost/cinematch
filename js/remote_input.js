/**
 * CineMatch - Fire TV Remote & Gamepad Controller
 * Handles 5-way D-Pad, remote Select/Back keys, and Gamepad API.
 */

class RemoteInputManager {
    constructor() {
        this.listeners = [];
        this.lastGamepadState = {};
        this.initKeyboard();
        this.initGamepad();
    }

    onRemoteEvent(handler) {
        this.listeners.push(handler);
    }

    emit(action, event) {
        for (const handler of this.listeners) {
            handler(action, event);
        }
    }

    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            const key = e.key;

            switch (key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.emit('LEFT', e);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.emit('RIGHT', e);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.emit('UP', e);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.emit('DOWN', e);
                    break;
                case 'Enter':
                case 'Select':
                case ' ':
                    e.preventDefault();
                    this.emit('SELECT', e);
                    break;
                case 'Escape':
                case 'Backspace':
                case 'BrowserBack':
                case 'GoBack':
                    e.preventDefault();
                    this.emit('BACK', e);
                    break;
                case 'MediaPlayPause':
                    e.preventDefault();
                    this.emit('PLAY_PAUSE', e);
                    break;
                default:
                    // Hotkeys for rapid desktop testing: Y = Yes, P = Probably, S = Skip, N = No, U = Undo
                    if (key.toLowerCase() === 'y') this.emit('HOTKEY_YES', e);
                    else if (key.toLowerCase() === 'p') this.emit('HOTKEY_PROBABLY', e);
                    else if (key.toLowerCase() === 'n') this.emit('HOTKEY_NO', e);
                    else if (key.toLowerCase() === 's') this.emit('HOTKEY_SKIP', e);
                    else if (key.toLowerCase() === 'u') this.emit('HOTKEY_UNDO', e);
                    break;
            }
        });
    }

    initGamepad() {
        // Poll Gamepad for Fire TV game controller support
        const pollGamepad = () => {
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            const gp = gamepads[0];
            if (gp) {
                const now = Date.now();
                if (!this.lastGpTime || now - this.lastGpTime > 220) {
                    // D-Pad buttons (standard mapping: 12=Up, 13=Down, 14=Left, 15=Right, 0=Select/A, 1=Back/B)
                    if (gp.buttons[14]?.pressed || gp.axes[0] < -0.5) {
                        this.emit('LEFT');
                        this.lastGpTime = now;
                    } else if (gp.buttons[15]?.pressed || gp.axes[0] > 0.5) {
                        this.emit('RIGHT');
                        this.lastGpTime = now;
                    } else if (gp.buttons[12]?.pressed || gp.axes[1] < -0.5) {
                        this.emit('UP');
                        this.lastGpTime = now;
                    } else if (gp.buttons[13]?.pressed || gp.axes[1] > 0.5) {
                        this.emit('DOWN');
                        this.lastGpTime = now;
                    } else if (gp.buttons[0]?.pressed) {
                        this.emit('SELECT');
                        this.lastGpTime = now;
                    } else if (gp.buttons[1]?.pressed) {
                        this.emit('BACK');
                        this.lastGpTime = now;
                    }
                }
            }
            requestAnimationFrame(pollGamepad);
        };
        requestAnimationFrame(pollGamepad);
    }
}

window.remoteInput = new RemoteInputManager();
