function toggleReasoning() {
    const box = document.querySelector('.reasoning-box');
    if (box) box.classList.toggle('open');
}

document.addEventListener('DOMContentLoaded', () => {
    const messagesContainer = document.getElementById('messages');
    const welcomeScreen = document.getElementById('welcome-screen');
    const input = document.querySelector('textarea');
    const sendBtn = document.querySelector('.send-btn');
    const newChatBtn = document.getElementById('new-chat-trigger');
    const chatSessions = document.getElementById('chat-sessions');

    let chatHistory = [];

    // Configure marked
    marked.setOptions({ breaks: true, gfm: true });

    // Auto-resize textarea
    input.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    function startNewChat() {
        if (chatHistory.length > 0) {
            // Save current to sidebar before clearing
            const title = chatHistory[0].content.substring(0, 25) + "...";
            const sessionItem = document.createElement('div');
            sessionItem.className = 'history-item';
            sessionItem.innerHTML = `<i data-lucide="message-square"></i><span>${title}</span>`;
            chatSessions.prepend(sessionItem);
            lucide.createIcons();
        }

        chatHistory = [];
        messagesContainer.innerHTML = '';
        if (welcomeScreen) {
            messagesContainer.appendChild(welcomeScreen);
            welcomeScreen.style.display = 'flex';
        }
    }

    if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);

    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        // Hide welcome screen on first message
        if (welcomeScreen) welcomeScreen.style.display = 'none';

        // 1. Add User Message to UI
        const userDiv = document.createElement('div');
        userDiv.className = 'message user';
        userDiv.innerHTML = `<div class="message-content">${text}</div>`;
        messagesContainer.appendChild(userDiv);

        input.value = '';
        input.style.height = 'auto';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // 2. Add "Thinking" placeholder
        const aiDiv = document.createElement('div');
        aiDiv.className = 'message ai loading';
        aiDiv.innerHTML = `
            <div class="ai-header">
                <div class="ai-avatar"><i data-lucide="sparkles"></i></div>
                <span class="ai-name">جاري التفكير...</span>
            </div>
            <div class="message-content">...</div>
        `;
        messagesContainer.appendChild(aiDiv);
        lucide.createIcons();
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: chatHistory
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            let formattedReasoning = data.reasoning;
            if (Array.isArray(data.reasoning)) {
                formattedReasoning = data.reasoning.map(r => r.text || '').join('\n');
            }

            aiDiv.classList.remove('loading');
            aiDiv.innerHTML = `
                <div class="ai-header">
                    <div class="ai-avatar"><i data-lucide="sparkles"></i></div>
                    <span class="ai-name">المساعد الذكي</span>
                </div>
                ${formattedReasoning ? `
                <div class="reasoning-box">
                    <button class="reasoning-toggle" onclick="toggleReasoning()">
                        <i data-lucide="brain"></i>
                        <span>عرض عملية التفكير...</span>
                        <i data-lucide="chevron-down" id="reasoning-chevron"></i>
                    </button>
                    <div class="reasoning-content">${marked.parse(formattedReasoning)}</div>
                </div>` : ''}
                <div class="message-content markdown-body">${marked.parse(data.content || '')}</div>
                <div class="message-footer">
                    <button class="action-btn" onclick="copyToClipboard(\`${data.content.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)"><i data-lucide="copy"></i> نسخ</button>
                    <button class="action-btn"><i data-lucide="refresh-cw"></i> إعادة</button>
                </div>
            `;

            lucide.createIcons();

            // Update history
            chatHistory.push({ role: "user", content: text });
            chatHistory.push({ role: "assistant", content: data.content });

        } catch (error) {
            console.error(error);
            const errorMessage = error.message || "عذراً، حدث خطأ أثناء الاتصال بالخادم.";
            aiDiv.innerHTML = `<div class="message-content error" style="color: #ef4444;">${errorMessage}</div>`;
        }

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('تم النسخ إلى الحافظة');
    });
}
