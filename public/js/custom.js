(function () {

	'use strict'


	AOS.init({
		duration: 800,
		easing: 'slide',
		once: true
	});

	var preloader = function() {

		var loader = document.querySelector('.loader');
		var overlay = document.getElementById('overlayer');

		function fadeOut(el) {
			el.style.opacity = 1;
			(function fade() {
				if ((el.style.opacity -= .1) < 0) {
					el.style.display = "none";
				} else {
					requestAnimationFrame(fade);
				}
			})();
		};

		setTimeout(function() {
			fadeOut(loader);
			fadeOut(overlay);
		}, 200);
	};
	preloader();


	// 메인 화면 배경 슬라이더 (tiny-slider는 메인 화면에서만 로드)
	if (document.querySelector('.hero-slide') && window.tns) {
		tns({
			container: '.hero-slide',
			mode: 'carousel',
			speed: 700,
			autoplay: true,
			controls: false,
			nav: false,
			autoplayButtonOutput: false
		});
	}

})()
