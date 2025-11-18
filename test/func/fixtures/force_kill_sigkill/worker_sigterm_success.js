setTimeout(() => {}, 10000);

process.on('disconnect', () => {
    // process.exit(1);
    const start = Date.now();
    while (Math.random() < 1) {
        if (Date.now() - start > 3000) {
            break;
        }
    }
});

