(function(){

	'use strict'


	var siteMenuClone = function() {
		var jsCloneNavs = document.querySelectorAll('.js-clone-nav');
		var siteMobileMenuBody = document.querySelector('.site-mobile-menu-body');

		jsCloneNavs.forEach(nav => {
			var navCloned = nav.cloneNode(true);
			navCloned.setAttribute('class', 'site-nav-wrap');
			siteMobileMenuBody.appendChild(navCloned);
		});


		// Click js-menu-toggle

		var menuToggle = document.querySelectorAll(".js-menu-toggle");
		menuToggle.forEach(mtoggle => {
			mtoggle.addEventListener("click", (e) => {
				e.preventDefault();
				var open = document.body.classList.toggle('offcanvas-menu');
				menuToggle.forEach(m => m.classList.toggle('active', open));
			});
		});


		var specifiedElement = document.querySelector(".site-mobile-menu");
		document.addEventListener('click', function(event) {
			var isClickInside = specifiedElement.contains(event.target);
			var isToggle = Array.from(menuToggle).some(m => m.contains(event.target));

			if (!isClickInside && !isToggle && document.body.classList.contains('offcanvas-menu')) {
				document.body.classList.remove('offcanvas-menu');
				menuToggle.forEach(m => m.classList.remove('active'));
			}
		});

	};
	siteMenuClone();


})()
