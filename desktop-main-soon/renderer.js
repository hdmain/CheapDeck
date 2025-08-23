document.addEventListener('DOMContentLoaded', () => {
    const helloBtn = document.getElementById('hello-btn');
    const apiBtn = document.getElementById('api-btn');
    
    helloBtn.addEventListener('click', () => {
        alert('Hello from Electron!');
        console.log('Button was clicked!');
    });

    // New button for API communication
    if (apiBtn) {
        apiBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('http://127.0.0.1:5000/api/hello');
                const data = await response.json();
                alert(`API Response: ${data.message}`);
                console.log('API Response:', data);
            } catch (error) {
                alert('API connection error! Make sure the Python server is running.');
                console.error('API Error:', error);
            }
        });
    }
});
