document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('whitepapers-container');
    const header = document.getElementById('header');

    fetch('whitepaper/whitepapers.json')
        .then(response => response.json())
        .then(data => {
            let wp_counter = 0; // Counter for active statuses

            data.forEach(item => {
                if (item.active) {
                    wp_counter++; // Increment counter for each active item

                    const wrapper = document.createElement('div');
                    wrapper.className = 'image-wrapper';

                    const imageBox = document.createElement('div');
                    imageBox.className = 'image-box';
                    imageBox.addEventListener('pointerdown', (event) => handlePointerDown(event, imageBox, item.PDF.path)); // Unified handling

                    const img = document.createElement('img');
                    img.alt = `${item.language.en} Flag`;

                    // Dynamically set the image source based on the en language
                    if (item.language.en === 'Braille') {
                        img.src = '/img/braille.webp';
                        img.classList.add('custom-size-image');
                    } else if (item.language.en === 'SomeLanguage') {
                        img.src = 'https://path/to/#/image.svg';
                        img.classList.add('custom-size-image');
                    } else if (item.language.en === 'anotherLanguage') {
                        img.src = 'https://#/image.svg';
                        img.classList.add('custom-size-image');
                    } else {
                        // Default flag image using alpha-2 code if no specific image is found
                        img.src = `https://hatscripts.github.io/circle-flags/flags/${item.language['alpha-2'].toLowerCase()}.svg`;
                    }

                    img.style.opacity = '0.8';
                    imageBox.appendChild(img);

                    const langName = document.createElement('div');
                    langName.className = 'lang-name';
                    langName.innerHTML = `<p>${item.language.en}</p>`;
                    langName.addEventListener('pointerdown', (event) => handlePointerDown(event, imageBox, item.PDF.path)); // Unified handling

                    const translatorInfo = document.createElement('div');
                    translatorInfo.className = 'translator-info';
                    translatorInfo.style.display = 'none';

                    const note = document.createElement('p');
                    note.textContent = item.translators.note;

                    translatorInfo.appendChild(note);

                    item.translators.translator.forEach(translator => {
                        const translatorLink = document.createElement('a');
                        translatorLink.href = translator.t_link;
                        translatorLink.className = 'translator-link';
                        translatorLink.textContent = translator.t_name;

                        // Prevent click event from bubbling up to parent elements
                        translatorLink.addEventListener('click', function (event) {
                            event.stopPropagation();
                        });

                        translatorInfo.appendChild(translatorLink);
                        translatorInfo.appendChild(document.createElement('br'));
                    });

                    langName.appendChild(translatorInfo);
                    wrapper.appendChild(imageBox);
                    wrapper.appendChild(langName);
                    container.appendChild(wrapper);

                    // Handle long press or right click
                    setupLongPress(imageBox, item);
                    setupLongPress(langName, item);
                }
            });

            // Update the header with the count of active statuses
            header.textContent = `Bitcoin white paper \n translated in ${wp_counter} languages`;
            header.classList.add('header');

            // Ensure "Upload Instructions" is appended last
            appendUploadInstructions(container);
        })
        .catch(error => console.error('Error fetching JSON:', error));
});

function setupLongPress(element, item) {
    let pressTimer;
    let longPressDuration = 2000; // 2 seconds

    element.addEventListener('pointerdown', startLongPress);
    element.addEventListener('pointerup', cancelLongPress);
    element.addEventListener('pointerleave', cancelLongPress);

    function startLongPress(e) {
        e.preventDefault(); // Prevent default click behavior
        pressTimer = setTimeout(() => {
            openInfoModal(item);
        }, longPressDuration);
    }

    function cancelLongPress() {
        clearTimeout(pressTimer);
    }
}

function handlePointerDown(event, box, pdfPath) {
    if (event.target.tagName.toLowerCase() !== 'a') {  // If not clicking on a link
        handleClick(box, pdfPath);
    }
}

// Function to open the information modal with existing styling
function openInfoModal(item) {
    // Get the existing modal container
    const infoModal = document.getElementById('infoModal');
    const modalContent = infoModal.querySelector('.modal-content');

    // Clear existing content inside modal-content, except for the close button
    modalContent.innerHTML = '<span class="close-icon" onclick="closeInfoModal()">&times;</span>';

    // Modal title
    const title = document.createElement('h2');
    title.innerHTML = `Whitepaper in ${item.language.en}<hr>${item.PDF.path.split('/').pop()}`;

    // Download button
    const downloadButton = document.createElement('button');
    downloadButton.textContent = 'Download';
    downloadButton.onclick = function () {
        window.open(item.PDF.path, '_blank'); // Open the PDF in a new tab
    };

    // Hash of the file
    const hashText = document.createElement('p');
    hashText.textContent = `Hash of the file: ${item.PDF.hash}`;

    // VirusTotal link
    const virusTotalLink = document.createElement('p');
    virusTotalLink.innerHTML = `<a href="${item.PDF.virusTotal_link}" target="_blank">VirusTotal Link</a>`;

    // Append all elements to modal content
    modalContent.appendChild(title);
    modalContent.appendChild(downloadButton);
    modalContent.appendChild(hashText);
    modalContent.appendChild(virusTotalLink);

    // Show the modal
    infoModal.classList.add('active');
    document.body.classList.add('modal-open'); // Add class to body for blur effect
}

// Function to close the information modal
function closeInfoModal() {
    document.getElementById('infoModal').classList.remove('active');
    document.body.classList.remove('modal-open'); // Remove class to body for blur effect
}

// Function to append the "Upload Instructions" block with a unique behavior
function appendUploadInstructions(container) {
    const uploadWrapper = document.createElement('div');
    uploadWrapper.className = 'image-wrapper';

    const uploadImageBox = document.createElement('div');
    uploadImageBox.className = 'image-box';
    // This onclick event specifically opens the upload modal
    uploadImageBox.onclick = openUploadModal;

    const uploadImg = document.createElement('img');
    uploadImg.src = 'img/bin.webp';
    uploadImg.alt = 'Upload Instructions';
    uploadImg.classList.add('custom-size-image');
    uploadImageBox.appendChild(uploadImg);

    const uploadLangName = document.createElement('div');
    uploadLangName.className = 'lang-name';
    uploadLangName.innerHTML = `<p>Upload Instructions</p>`;

    uploadWrapper.appendChild(uploadImageBox);
    uploadWrapper.appendChild(uploadLangName);

    // Append the upload instructions as the last child of the container
    container.appendChild(uploadWrapper);
}

// Function to open the upload modal
function openUploadModal() {
    const uploadModal = document.getElementById('uploadModal');
    if (uploadModal) {
        uploadModal.classList.add('active');
        document.body.classList.add('modal-open');
    }
}

// Function to close the upload modal (make sure it is properly defined)
function closeUploadModal() {
    console.log("Attempting to close upload modal");
    const uploadModal = document.getElementById('uploadModal');
    if (uploadModal.classList.contains('active')) {
        uploadModal.classList.remove('active');
        document.body.classList.remove('modal-open');
        console.log("Upload modal closed");
    } else {
        console.log("Upload modal was not active");
    }
}

// Existing functions for handling clicks and modals
function handleClick(box, pdfPath) {
    const translatorInfo = box.nextElementSibling.querySelector('.translator-info');
    let expanded = translatorInfo.style.display === 'block';
    let autoCloseTimeout;

    if (!expanded) {
        translatorInfo.style.display = 'block';
        box.parentElement.style.zIndex = '100'; // Bring the whole wrapper to the top
        autoCloseTimeout = setTimeout(() => {
            translatorInfo.style.display = 'none';
            box.parentElement.style.zIndex = '10'; // Reset zIndex after closing
        }, 3000);
    } else {
        clearTimeout(autoCloseTimeout);
        window.open(pdfPath, '_blank');
    }
}

window.addEventListener('click', function(event) {
    var modal = document.getElementById('uploadModal');
    if (event.target == modal) {
        closeModal();
    }
});
