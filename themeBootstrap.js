(() => {
    const themes = ['legacy', 'coffee', 'forest', 'ocean', 'space', 'electric', 'ice', 'marshmellow', 'amsterdam'];
    let selected = 'legacy';
    try { selected = localStorage.getItem('satoshiSiteTheme') || selected; } catch { /* Use Legacy. */ }
    document.documentElement.dataset.theme = themes.includes(selected) ? selected : 'legacy';
})();
