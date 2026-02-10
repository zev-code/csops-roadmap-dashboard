document.addEventListener('DOMContentLoaded', async () => {
    const app = document.getElementById('app');

    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        if (data.status === 'ok') {
            app.innerHTML = '<p>Dashboard ready. API connected.</p>';
        }
    } catch (error) {
        app.innerHTML = '<p>Error connecting to API.</p>';
        console.error('API error:', error);
    }
});
