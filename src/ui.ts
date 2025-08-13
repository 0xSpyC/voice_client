const app = document.getElementById('app') as HTMLElement

const voice_client_container = document.createElement('div')
voice_client_container.classList.add('voice-client-container')

const status_container = document.createElement('div')
status_container.classList.add('status-container')

const status_text = document.createElement('span')
status_text.classList.add('status-text')

const hang_button = document.createElement('button')
hang_button.classList.add('hang-button')

const debug_button = document.createElement('button')
debug_button.classList.add('debug-button')

app.appendChild(voice_client_container)
voice_client_container.appendChild(status_container)
voice_client_container.appendChild(hang_button)
voice_client_container.appendChild(debug_button)

export const elements = {
    hangButton: hang_button,
    debugButton: debug_button,
    statusContainer: status_container,
    statusText: status_text
};

export function updateStatus(text: string, color: string) {
    elements.statusText.textContent = text;
    elements.statusContainer.style.borderColor = color;
}

export function updateButtonState(isConnect: boolean) {
    const btn = elements.hangButton;
    if (isConnect) {
        btn.textContent = 'Connect';
        btn.classList.remove('hang-up');
        btn.classList.add('connect');
    } else {
        btn.textContent = 'Hang Up';
        btn.classList.remove('connect');
        btn.classList.add('hang-up');
    }
}
