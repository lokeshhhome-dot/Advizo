module.exports = {
    apps: [
        {
            name: "test-online-consultation",
            script: "index.js", // ya app.js
            watch: false,       // 🔴 MOST IMPORTANT
            env: {
                NODE_ENV: "production"
            }
        }
    ]
};
