$('#copy-share-link-button').click((e) => {
    navigator.clipboard.writeText($('#share-link').val())
        .then(() => {
            $(e.target).removeClass('btn-outline-dark');
            $(e.target).addClass('btn-dark');
        })
        .catch(() => {
            window.alert('Your browser does not support the Clipboard API! Copy link manually...');
        });

    return false;
});