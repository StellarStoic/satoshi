document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) window.lucide.createIcons();

    const buttons = [...document.querySelectorAll('.goal-picker button')];
    const choices = [...document.querySelectorAll('.choice-card')];
    buttons.forEach(button => button.addEventListener('click', () => {
        const goal = button.dataset.goal;
        buttons.forEach(item => item.classList.toggle('active', item === button));
        choices.forEach(choice => {
            const matches = goal === 'all' || choice.dataset.goals.split(' ').includes(goal);
            choice.classList.toggle('highlight', goal !== 'all' && matches);
            choice.classList.toggle('dimmed', goal !== 'all' && !matches);
        });
    }));
});
