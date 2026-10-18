var theToggle = document.getElementById('toggle');
var theMenu = document.getElementById('menu');

// based on Todd Motto functions
// https://toddmotto.com/labs/reusable-js/

// hasClass
function hasClass(elem, className) {
	return new RegExp(' ' + className + ' ').test(' ' + elem.className + ' ');
}
// addClass
function addClass(elem, className) {
    if (!hasClass(elem, className)) {
    	elem.className += ' ' + className;
    }
}
// removeClass
function removeClass(elem, className) {
	var newClass = ' ' + elem.className.replace( /[\t\r\n]/g, ' ') + ' ';
	if (hasClass(elem, className)) {
        while (newClass.indexOf(' ' + className + ' ') >= 0 ) {
            newClass = newClass.replace(' ' + className + ' ', ' ');
        }
        elem.className = newClass.replace(/^\s+|\s+$/g, '');
    }
}
// toggleClass
function toggleClass(elem, className) {
	var newClass = ' ' + elem.className.replace( /[\t\r\n]/g, " " ) + ' ';
    if (hasClass(elem, className)) {
        while (newClass.indexOf(" " + className + " ") >= 0 ) {
            newClass = newClass.replace( " " + className + " " , " " );
        }
        elem.className = newClass.replace(/^\s+|\s+$/g, '');
    } else {
        elem.className += ' ' + className;
    }
}

function closeSubmenus() {
    document.querySelectorAll('.has-submenu.active').forEach(function(activeItem) {
        removeClass(activeItem, 'active');
        activeItem.querySelector(':scope > a')?.setAttribute('aria-expanded', 'false');
    });
    if (theMenu) removeClass(theMenu, 'submenu-view');
}

function closeBurgerMenu() {
    if (theToggle) {
        removeClass(theToggle, 'on');
        theToggle.setAttribute('aria-expanded', 'false');
    }
    closeSubmenus();
}

if (theToggle) {
    theToggle.setAttribute('aria-expanded', hasClass(theToggle, 'on') ? 'true' : 'false');
    theToggle.onclick = function() {
        toggleClass(this, 'on');
        var isOpen = hasClass(this, 'on');
        this.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (!isOpen) closeSubmenus();
        return false;
    };
}

// NEW CODE: Submenu functionality
document.addEventListener('DOMContentLoaded', function() {
    const priceLink = document.querySelector('#menu a[href$="chart.html"]') ||
        Array.from(document.querySelectorAll('#menu .submenu a')).find(function(link) {
            return link.textContent.trim() === 'History chart';
        });
    if (priceLink && !document.querySelector('#menu a[href$="priceScanner.html"]')) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = 'priceScanner.html';
        link.textContent = 'Price Scanner';
        item.append(link);
        priceLink.closest('li').after(item);
    }
    // Get all menu items that have submenus
    var submenuItems = document.querySelectorAll('.has-submenu > a');
    
    // Add click event to each submenu trigger
    submenuItems.forEach(function(menuItem) {
        menuItem.setAttribute('aria-expanded', 'false');
        menuItem.addEventListener('click', function(e) {
            // Prevent the link from navigating if it's just '#'
            if (this.getAttribute('href') === '#') {
                e.preventDefault();
            }
            
            var parentLi = this.parentElement;
            var wasActive = hasClass(parentLi, 'active');
            
            // Close other open submenus
            document.querySelectorAll('.has-submenu.active').forEach(function(activeItem) {
                removeClass(activeItem, 'active');
                activeItem.querySelector(':scope > a')?.setAttribute('aria-expanded', 'false');
            });
            
            // The selected category becomes a focused submenu view. Selecting its
            // heading again returns to the complete main menu.
            if (wasActive) {
                removeClass(theMenu, 'submenu-view');
                this.setAttribute('aria-expanded', 'false');
            } else {
                addClass(parentLi, 'active');
                addClass(theMenu, 'submenu-view');
                this.setAttribute('aria-expanded', 'true');
            }
        });
    });
    
    // Close the complete navigation when the user clicks beyond it.
    document.addEventListener('click', function(e) {
        if (!theMenu?.contains(e.target) && !theToggle?.contains(e.target)) closeBurgerMenu();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && theToggle && hasClass(theToggle, 'on')) {
            closeBurgerMenu();
            theToggle.focus();
        }
    });
});
