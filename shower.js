/**
 * Shower HTML presentation engine: github.com/shower/shower
 * @copyright 2010–2013 Vadim Makeev, pepelsbey.net
 * @license MIT license: github.com/shower/shower/wiki/MIT-License
 */
window.shower = window.shower || (function(window, document, undefined) {
	var shower = {},
		url = window.location,
		body = document.body,
		jsonSource,
		slides = [],
		progress = [],
		slideList = [],
		timer,
		isHistoryApiSupported = !!(window.history && history.pushState);

	/**
	 * Get value at named data store for the DOM element.
	 * @private
	 * @param {HTMLElement} element
	 * @param {String} name
	 * @returns {String}
	 */
	shower._getData = function(element, name) {
		return element.dataset ? element.dataset[name] : element.getAttribute('data-' + name);
	};

	/**
	 * Init
	 * @param {String} slideSelector
	 * @param {String} progressBarSelector
	 * @param {String} jsonSourceSelector
	 * @param {String} jsonSlideshow
	 * @returns {Object} shower
	 */
	shower.init = function(slideSelector, progressSelector, jsonSourceSelector, jsonSlideshow) {
		slideSelector = slideSelector || '.slide';
		progressSelector = progressSelector || 'div.progress div';
		jsonSourceSelector = jsonSourceSelector || 'meta[name="showerJsonSource"]';

		//Check for JSON
		var jsonSourceElement = document.querySelector(jsonSourceSelector);
		jsonSource = jsonSourceElement ? jsonSourceElement.content : null;

		//If we have JSON, parse it
		if (jsonSlideshow) {
			//If direct JSON exists, then just use that instead of the JSON source
			shower._parseJson(JSON.parse(jsonSlideshow));
		}
		else if (jsonSource) {
     		var xmlHttp;
     		if(window.XMLHttpRequest) {
 				//IE7+, Firefox, Safari, Opera...
 				xmlHttp = new XMLHttpRequest();
 			}
     		else {
 				//IE6...
 				xmlHttp = new ActiveXObject('MSXML2.XMLHTTP');
 			}

     		//Execute request
     		xmlHttp.open('GET', jsonSource, false);
			xmlHttp.send();
			if (xmlHttp.status === 200) {
				shower._parseJson(JSON.parse(xmlHttp.responseText));
			}
		}

		//Now look for the slides
		slides = document.querySelectorAll(slideSelector);
		progress = document.querySelector(progressSelector);
		slideList = [];

		//Parse the slides
		for (var i = 0; i < slides.length; i++) {
			// Slide IDs are optional. In case of missing ID we set it to the
			// slide number
			if ( ! slides[i].id) {
				slides[i].id = i + 1;
			}

			slideList.push({
				id: slides[i].id,
				hasInnerNavigation: null !== slides[i].querySelector('.next'),
				hasTiming: (shower._getData(slides[i], 'timing') && shower._getData(slides[i], 'timing').indexOf(':') !== -1)
			});
		}
		return shower;
	};

	/**
	* Parse JSON into a DOM representation
	* @param {JSON} json
	* @private
	* @returns {Object} shower
	*/
	shower._parseJson = function(json) {
		if(json) {
			//Setup marked (https://github.com/chjj/marked)
			marked.setOptions({
				gfm: true,
				tables: true,
				breaks: true,
				pedantic: false,
				sanitize: true,
				smartLists: true,
				langPrefix: 'language-',
				highlight: function(code, lang) {
					if (lang === 'js') {
						return highlighter.javascript(code);
					}
					return code;
				}
			});

			//Make sure the required elements exist
			if(!body) {
				body = document.createElement('BODY');
				document.documentElement.appendChild(body);
			}

			// First we want to clear out any old junk that may exist
			var it = body.lastChild;
			while (it && it.previousSibling) {
				var node = it;
				it = it.previousSibling;

				// Make sure to skip the script that loads this file
				if(node.nodeName == 'SCRIPT') {
					var src = node.src;
					if (src && (src.lastIndexOf('shower.js') > 0 || src.lastIndexOf('shower.min.js') > 0)) { //XXX Could probably use some regex...
						continue;
					}
					else if (src && src.lastIndexOf('marked.js') > 0) { //XXX Could probably use some regex...
						continue;
					}
				}
				else if (node.hasAttributes() && node.getAttribute('dontremove') == 'true') {
					continue;
				}

				//Remove the child
			    body.removeChild(node);
			}

			//Make sure we retain some element ordering
			var addBefore = body.firstChild;
			if(!addBefore) {
				//Need at least one node
				addBefore = document.createElement('A');
				body.appendChild(addBefore);
			}

			//Next, set the title (if it exists)
			var title = json.name || 'DEFAULT: Shower Presentation';
			var list = document.head.childNodes;
			for (var i = 0; i < list.length; i++) {
				if(list[i].nodeName == 'TITLE') {
					list[i].text = title;
					break;
				}
			}

			//Generate the header
			var att;
			var ele;
			var ele2;
			if(json.slideshow && json.slideshow.header) {
				var header = json.slideshow.header;
				ele = document.createElement('HEADER');
				ele2 = document.createElement('H1');
				shower._processJsonMarkdown(ele2, title);
				ele.appendChild(ele2);
				body.insertBefore(ele, addBefore);
				if(header.domClass) {
					ele.classList.add(header.domClass);
				}
				if(header.author || header.company) {
					ele2 = document.createElement('P');
					ele.appendChild(ele2);

					var ele3;
					var part;
					//XXX Can probably replace a good chunk of this with markdown...
					if(header.author) {
						ele3 = document.createElement('A');
						ele2.appendChild(ele3);
						for(part in header.author) {
							if(part == 'name') {
								shower._processJsonMarkdown(ele3, header.author[part]);
							}
							else if(part == 'url') {
								att = document.createAttribute('href');
								att.value = header.author[part];
								ele3.setAttributeNode(att);
							}
						}
					}
					if(header.author && header.company) {
						var txt = document.createTextNode(', ');
						ele2.appendChild(txt);
					}
					if(header.company) {
						ele3 = document.createElement('A');
						ele2.appendChild(ele3);
						for(part in header.company) {
							if(part == 'name') {
								shower._processJsonMarkdown(ele3, header.company[part]);
							}
							else if(part == 'url') {
								att = document.createAttribute('href');
								att.value = header.company[part];
								ele3.setAttributeNode(att);
							}
						}
					}
				}
			}

			//Now we can start parsing through slides
			if(json.slides) {
				for(var slideIndex in json.slides) {
					var slide = json.slides[slideIndex];
					if(slide.type == 'main' || slide.type == 'text' || slide.type == 'title' || slide.type == 'innav') {
						var d = shower._parseJsonToSlide(slide);
						if(d) {
							body.insertBefore(d, addBefore);
						}
					}
					else if(window.console) {
						window.console.log('Unknown slide type: ' + slide.type);
					}
				}
			}

			//Last, we need progress
			if(json.slideshow && json.slideshow.progressBar) {
				ele = document.createElement('DIV');
				ele2 = document.createElement('DIV');
				ele.appendChild(ele2);
				body.insertBefore(ele, addBefore);

				ele.classList.add(json.slideshow.progressBarClass || 'progress');
			}
		}
		return shower;
	};

	/**
	* Parse a JSON slide into a DOM representation
	* @param {JSON} slideJson
	* @private
	* @returns {Object} DOM
	*/
	shower._parseJsonToSlide = function(slideJson) {
		var retSlide = null;
		if(slideJson && slideJson.type) {
			var att;
			var txt;
			var ele = document.createElement('SECTION');
			var ele2 = document.createElement('DIV');
			retSlide = ele;
			ele.appendChild(ele2);

			ele.classList.add('slide');
			if(slideJson.domClass) {
				//If a custom class exists, use it instead of basing it off type
				ele.classList.add(slideJson.domClass);
			}
			else if(slideJson.type == 'main' || slideJson.background) { //Background seems to be the decision maker for if a slide is 'cover'
				ele.classList.add('cover');
			}
			else if(slideJson.type == 'title') {
				ele.classList.add('shout');
			}

			if(slideJson.id) {
				att = document.createAttribute('id');
				att.value = slideJson.id;
				ele.setAttributeNode(att);
			}

			if(slideJson.timer) {
				att = document.createAttribute('data-timing');
				var time = Number(slideJson.timer).valueOf();
				var timeStr = '';
				if((time / 60) < 10) {
					timeStr += '0';
				}
				timeStr += (time / 60).toFixed() + ':';
				if((time % 60) < 10) {
					timeStr += '0';
				}
				att.value = timeStr + (time % 60).toFixed();
				ele.setAttributeNode(att);
			}

			ele = ele2;
			ele2 = document.createElement('H2');
			shower._processJsonMarkdown(ele2, slideJson.title || '');
			ele.appendChild(ele2);

			if(slideJson.background) {
				ele2 = document.createElement('IMG');
				ele.appendChild(ele2);

				att = document.createAttribute('src');
				att.value = slideJson.background;
				ele2.setAttributeNode(att);

				att = document.createAttribute('alt');
				att.value = slideJson.backgroundAlt || '';
				ele2.setAttributeNode(att);
			}

			if(slideJson.content) {
				shower._processJsonContent(ele, slideJson.content, slideJson.type);
			}

			if(slideJson.footer) {
				ele2 = document.createElement('FOOTER');
				txt = document.createTextNode(slideJson.footer);
				ele2.appendChild(txt);
				ele.appendChild(ele2);
			}
		}
		return retSlide;
	};

	/**
	 * Process a slide's JSON content
	 * @param {Node} parent
	 * @param {JSON Array} content
	 * @param {String} slideType
	 * @param {String} textElementType
	 * @private
	 * @returns {Node}
	 */
	shower._processJsonContent = function(parent, content, slideType, textElementType) {
		if(textElementType == undefined || textElementType == null) {
			textElementType = 'P';
		}
		for(var i = 0; i < content.length; i++) {
			var ele = null;
			if (typeof(content[i]) === 'object') {
				var obj = content[i];
				for(var n in obj) {

					if(n == 'bullets' || n == 'numlist') {
						//Lists
						if(n == 'bullets') {
							ele = document.createElement('UL');
						}
						else {
							ele = document.createElement('OL');
						}
						shower._processJsonContent(ele, obj[n], slideType, 'LI');
					}
					else if(n == 'citation') {
						//Citation
						var cit = obj[n];
						ele = document.createElement('FIGURE');
						var ele2;

						if(cit['quote']) {
							ele2 = document.createElement('BLOCKQUOTE');
							ele.appendChild(ele2);
							ele2.appendChild(shower._processJsonMarkdown(document.createElement('P'), cit['quote']));
						}
						if(cit['author']) {
							ele.appendChild(shower._processJsonMarkdown(document.createElement('FIGCAPTION'), cit['author']));
						}
					}
					else if(n == 'code') {
						//Code
						ele = document.createElement('PRE');
						parent.appendChild(ele);
						shower._processJsonContent(ele, obj[n], slideType, 'CODE');
					}
					else if(n == 'codeline') {
						//A formatted line of code
						ele = document.createElement(textElementType);
						parent.appendChild(ele);
						var cl = obj[n];
						var ele2 = null;
						for(var k = 0; k < cl.length; k++) {
							if (typeof(cl[k]) === 'object') {
								var clObj = cl[k];

								if(clObj['marked']) {
									ele2 = shower._processJsonMarkdown(document.createElement('MARK'), String(clObj['marked']));
									if(clObj['codeclass']) {
										ele2.classList.add(clObj['codeclass']);
									}
								}
							}
							else {
								ele2 = shower._processJsonMarkdown(document.createElement('P'), String(cl[k]));
								if(ele2.innerHTML.indexOf('<') == -1 && ele2.innerHTML.indexOf('>') == -1) {
									//No "formatting", just make a text node
									ele2 = document.createTextNode(String(cl[k]));
								}
							}
							if(ele != null) {
								ele.appendChild(ele2);
							}
						}
					}
					else if(n == 'footnote') {
						ele = shower._processJsonMarkdown(document.createElement('P'), String(obj[n]));
						ele.classList.add('note');
					}
				}
			}
			else {
				//Simple process text
				ele = shower._processJsonMarkdown(document.createElement(textElementType), String(content[i]));
			}
			if(ele != null) {
				switch(slideType) {
					case 'innav':
						if(i > 0) {
							//Make as a 'next' item for inner navigation
							ele.classList.add('next');
						}
						break;
				}
				parent.appendChild(ele);
			}
		}
		return parent;
	};

	/**
	 * Process text that is formatted with Markdown
	 * @param {Node} outerElement
	 * @param {String} text
	 * @private
	 * @returns {Node} the same outer element that was passed in, or if the param was null, a <a> node
	 */
	shower._processJsonMarkdown = function(outerElement, text) {
		//Escape HTML stuff
		var handleFakeEscape = text.indexOf('~<') >= 0 || text.indexOf('~>') >= 0;

		//Replaces the first/last of every line's space/tab with a filler to prevent markdown from making it into code (we have an explict tag for it)
		var handleFakeSpaces = false;
		if(text.length > 0) {
			if(text[0] == ' ') {
				text = text.replace(' ', 'SHR_FAKE_SPACE');
				handleFakeSpaces = true;
			} else if(text[0] == '\t') {
				text = text.replace('\t', 'SHR_FAKE_TAB');
				handleFakeSpaces = true;
			}

			if(text[text.length - 1] == ' ') {
				text = text.substr(0, text.length - 2) + 'SHR_FAKE_SPACE';
				handleFakeSpaces = true;
			} else if(text[text.length - 1] == '\t') {
				text = text.substr(0, text.length - 2) + 'SHR_FAKE_TAB';
				handleFakeSpaces = true;
			}
		}
		var mark = marked(text);
		var ret;
		if(!outerElement || outerElement.nodeType > 1) { //Null or not something we can add children to
			ret = document.createElement('A');
		}
		else { //A Node or Element
			ret = outerElement;
		}

		if(mark.indexOf('<') >= 0 || mark.indexOf('>') >= 0) {
			//This takes some memory but allows us to easily strip newlines and outer elements
			var t = document.createElement('P');
			t.innerHTML = mark;
			mark = t.firstChild.innerHTML;
		}
		if(handleFakeSpaces) {
			//Replace fake spaces and tabs with real thing
			while(mark.indexOf('SHR_FAKE_SPACE') >= 0) {
				mark = mark.replace('SHR_FAKE_SPACE', ' ');
			}
			while(mark.indexOf('SHR_FAKE_TAB') >= 0) {
				mark = mark.replace('SHR_FAKE_TAB', '\t');
			}
		}
		if(handleFakeEscape) {
			while(mark.indexOf('~&lt;') >= 0) {
				mark = mark.replace('~&lt;', '<');
			}
			while(mark.indexOf('~&gt;') >= 0) {
				mark = mark.replace('~&gt;', '>');
			}
		}

		//Manually handle line breaks
		while(mark.indexOf('&gt;&gt;') >= 0) {
			mark = mark.replace('&gt;&gt;', '<br />');
		}

		ret.innerHTML = mark;
		return ret;
	};

	/**
	* Get slide scale value.
	* @private
	* @returns {String}
	*/
	shower._getTransform = function() {
		var denominator = Math.max(
			body.clientWidth / window.innerWidth,
			body.clientHeight / window.innerHeight
		);

		return 'scale(' + (1 / denominator) + ')';
	};

	/**
	* Set CSS transform with prefixes to body.
	* @private
	* @returns {Boolean}
	*/
	shower._applyTransform = function(transform) {
		body.style.WebkitTransform = transform;
		body.style.MozTransform = transform;
		body.style.msTransform = transform;
		body.style.OTransform = transform;
		body.style.transform = transform;

		return true;
	};

	/**
	* Check if arg is number.
	* @private
	* @param {String|Number} arg
	* @returns {Boolean}
	*/
	shower._isNumber = function(arg) {
		return ! isNaN(parseFloat(arg)) && isFinite(arg);
	};

	/**
	* Normalize slide number.
	* @private
	* @param {Number} slideNumber slide number (sic!)
	* @returns {Number}
	*/
	shower._normalizeSlideNumber = function(slideNumber) {
		if ( ! shower._isNumber(slideNumber)) {
			throw new Error('Gimme slide number as Number, baby!');
		}

		if (slideNumber < 0) {
			slideNumber = 0;
		}

		if (slideNumber >= slideList.length) {
			slideNumber = slideList.length - 1;
		}

		return slideNumber;
	};

	/**
	* Get slide id from HTML element.
	* @private
	* @param {HTMLElement} el
	* @returns {String}
	*/
	shower._getSlideIdByEl = function(el) {
		while ('BODY' !== el.nodeName && 'HTML' !== el.nodeName) {
			if (el.classList.contains('slide')) {
				return el.id;
			} else {
				el = el.parentNode;
			}
		}

		return '';
	};

	/**
	* For touch devices: check if link is clicked.
	*
	* @TODO: add support for textareas/inputs/etc.
	*
	* @private
	* @param {HTMLElement} e
	* @returns {Boolean}
	*/
	shower._checkInteractiveElement = function(e) {
		return 'A' === e.target.nodeName;
	};

	/**
	* Get slide number by slideId.
	* @param {String} slideId (HTML id or position in slideList)
	* @returns {Number}
	*/
	shower.getSlideNumber = function(slideId) {
		var i = slideList.length - 1,
			slideNumber;

		if (slideId === '') {
			slideNumber = 0;
		}

		// As fast as you can ;-)
		// http://jsperf.com/for-vs-foreach/46
		for (; i >= 0; --i) {
			if (slideId === slideList[i].id) {
				slideNumber = i;
				break;
			}
		}

		return slideNumber;
	};

	/**
	* Go to slide number.
	* @param {Number} slideNumber slide number (sic!). Attention: starts from zero.
	* @param {Function} [callback] runs only if you not in List mode.
	* @returns {Number}
	*/
	shower.go = function(slideNumber, callback) {
		if ( ! shower._isNumber(slideNumber)) {
			throw new Error('Gimme slide number as Number, baby!');
		}

		// Also triggers popstate and invoke shower.enter__Mode()
		url.hash = shower.getSlideHash(slideNumber);

		shower.updateProgress(slideNumber);
		shower.updateActiveAndVisitedSlides(slideNumber);

		if (shower.isSlideMode()) {
			shower.showPresenterNotes(slideNumber);
			shower.runInnerNavigation(slideNumber);
		}

		if (typeof(callback) === 'function') {
			callback();
		}

		return slideNumber;
	};

	/**
	* Show next slide or show next Inner navigation item.
	* Returns false on a last slide, otherwise returns shown slide number.
	* @param {Function} [callback] runs only if shower.next() is successfully completed.
	* @returns {Number|Boolean}
	*/
	shower.next = function(callback) {
		var currentSlideNumber = shower.getCurrentSlideNumber(),
			ret = false;

		// Only go to next slide if current slide have no inner
		// navigation or inner navigation is fully shown
		// NOTE: But first of all check if there is no current slide
		if (
			(
				-1 === currentSlideNumber ||
				! slideList[currentSlideNumber].hasInnerNavigation ||
				! shower.increaseInnerNavigation(currentSlideNumber)
			) &&
			// If exist next slide
			(currentSlideNumber + 2) <= slideList.length
		) {
			shower.go(currentSlideNumber + 1);
			// Slides starts from 0. So return next slide number.
			ret = currentSlideNumber + 2;
		}

		if (shower.isSlideMode()) {
			shower.runInnerNavigation(currentSlideNumber + 1);
		}

		if (typeof(callback) === 'function') {
			callback();
		}

		return ret;
	};

	/**
	* Show previous slide. Returns false on a first slide, otherwise returns shown slide number.
	* @param {Function} [callback] runs only if shower.previous() is successfully completed.
	* @returns {Number|Boolean}
	*/
	shower.previous = function(callback) {
		var currentSlideNumber = shower.getCurrentSlideNumber(),
			ret = false;

		// slides starts from 0
		if (currentSlideNumber > 0) {
			ret = currentSlideNumber;
			shower.go(currentSlideNumber - 1);

			if (typeof(callback) === 'function') {
				callback();
			}
		}

		return ret;
	};

	/**
	* Show first slide.
	* @param {Function} [callback]
	* @returns {Number}
	*/
	shower.first = function(callback) {
		if (typeof(callback) === 'function') {
			callback();
		}

		return shower.go(0);
	};

	/**
	* Show last slide.
	* @param {Function} [callback]
	* @returns {Number}
	*/
	shower.last = function(callback) {
		if (typeof(callback) === 'function') {
			callback();
		}
		return shower.go(slideList.length - 1);
	};

	/**
	* Switch to slide view.
	* @param {Function} [callback] runs only if shower.enterSlideMode() is successfully completed.
	* @returns {Boolean}
	*/
	shower.enterSlideMode = function(callback) {
		var isInSlideMode = shower.isSlideMode();
		var currentSlideNumber = shower.getCurrentSlideNumber();

		// Anyway: change body class (@TODO: refactoring)
		body.classList.remove('list');
		body.classList.add('full');

		// Preparing URL for shower.go()
		if (shower.isListMode() && isHistoryApiSupported) {
			history.pushState(null, null, url.pathname + '?full' + shower.getSlideHash(currentSlideNumber));
		}

		shower._applyTransform(shower._getTransform());

		if(!isInSlideMode) {
			//If a timed slide is clicked, the timer doesn't run
			shower.runInnerNavigation(currentSlideNumber);
		}

		if (typeof(callback) === 'function') {
			callback();
		}

		return true;
	};

	/**
	* Switch to list view.
	* @param {Function} [callback] runs only if shower.enterListMode() is successfully completed.
	* @returns {Boolean}
	*/
	shower.enterListMode = function(callback) {
		// Anyway: change body class (@TODO: refactoring)
		body.classList.remove('full');
		body.classList.add('list');

		shower.clearPresenterNotes();

		if (shower.isListMode()) {
			return false;
		}

		var currentSlideNumber = shower.getCurrentSlideNumber();

		clearTimeout(timer);

		if (shower.isSlideMode() && isHistoryApiSupported) {
			history.pushState(null, null, url.pathname + shower.getSlideHash(currentSlideNumber));
		}

		shower.scrollToSlide(currentSlideNumber);
		shower._applyTransform('none');

		if (typeof(callback) === 'function') {
			callback();
		}

		return true;
	};

	/**
	* Toggle Mode: Slide and List.
	* @param {Function} [callback]
	*/
	shower.toggleMode = function(callback) {
		if (shower.isListMode()) {
			shower.enterSlideMode();
		} else {
			shower.enterListMode();
		}

		if (typeof(callback) === 'function') {
			callback();
		}

		return true;
	};

	/**
	* Get current slide number. Starts from zero. Warning: when you have
	* slide number 1 in URL this method will return 0.
	* If something is wrong return -1.
	* @returns {Number}
	*/
	shower.getCurrentSlideNumber = function() {
		var i = slideList.length - 1,
			currentSlideId = url.hash.substr(1);

		// As fast as you can ;-)
		// http://jsperf.com/for-vs-foreach/46
		for (; i >= 0; --i) {
			if (currentSlideId === slideList[i].id) {
				return i;
			}
		}

		return -1;
	};

	/**
	* Scroll to slide.
	* @param {Number} slideNumber slide number (sic!)
	* @returns {Boolean}
	*/
	shower.scrollToSlide = function(slideNumber) {
		var currentSlide,
			ret = false;

		if ( ! shower._isNumber(slideNumber)) {
			throw new Error('Gimme slide number as Number, baby!');
		}

		if (shower.isSlideMode()) {
			throw new Error('You can\'t scroll to because you in slide mode. Please, switch to list mode.');
		}

		// @TODO: WTF?
		if (-1 === slideNumber) {
			return ret;
		}

		if (slideList[slideNumber]) {
			currentSlide = document.getElementById(slideList[slideNumber].id);
			window.scrollTo(0, currentSlide.offsetTop);
			ret = true;
		} else {
			throw new Error('There is no slide with number ' + slideNumber);
		}

		return ret;
	};

	/**
	* Check if it's List mode.
	* @returns {Boolean}
	*/
	shower.isListMode = function() {
		return isHistoryApiSupported ? ! (/^full.*/).test(url.search.substr(1)) : body.classList.contains('list');
	};

	/**
	* Check if it's Slide mode.
	* @returns {Boolean}
	*/
	shower.isSlideMode = function() {
		return isHistoryApiSupported ? (/^full.*/).test(url.search.substr(1)) : body.classList.contains('full');
	};

	/**
	* Update progress bar.
	* @param {Number} slideNumber slide number (sic!)
	* @returns {Boolean}
	*/
	shower.updateProgress = function(slideNumber) {
		// if progress bar doesn't exist
		if (null === progress) {
			return false;
		}

		if ( ! shower._isNumber(slideNumber)) {
			throw new Error('Gimme slide number as Number, baby!');
		}

		progress.style.width = (100 / (slideList.length - 1) * shower._normalizeSlideNumber(slideNumber)).toFixed(2) + '%';

		return true;
	};

	/**
	* Update active and visited slides.
	* @param {Number} slideNumber slide number (sic!)
	* @returns {Boolean}
	*/
	shower.updateActiveAndVisitedSlides = function(slideNumber) {
		var i,
			slide,
			l = slideList.length;

		slideNumber = shower._normalizeSlideNumber(slideNumber);

		if ( ! shower._isNumber(slideNumber)) {
			throw new Error('Gimme slide number as Number, baby!');
		}

		for (i = 0; i < l; ++i) {
			slide = document.getElementById(slideList[i].id);

			if (i < slideNumber) {
				slide.classList.remove('active');
				slide.classList.add('visited');
			} else if (i > slideNumber) {
				slide.classList.remove('visited');
				slide.classList.remove('active');
			} else {
				slide.classList.remove('visited');
				slide.classList.add('active');
			}
		}

		return true;
	};

	/**
	* Clear presenter notes in console.
	*/
	shower.clearPresenterNotes = function() {
		if (window.console && window.console.clear) {
			console.clear();
		}
	};

	/**
	* Show presenter notes in console.
	* @param {Number} slideNumber slide number (sic!). Attention: starts from zero.
	*/
	shower.showPresenterNotes = function(slideNumber) {
		shower.clearPresenterNotes();

		if (window.console) {
			slideNumber = shower._normalizeSlideNumber(slideNumber);

			var slideId = slideList[slideNumber].id,
				nextSlideId = slideList[slideNumber + 1] ? slideList[slideNumber + 1].id : null,
				notes = document.getElementById(slideId).querySelector('footer');

			if (notes && notes.innerHTML) {
				console.info(notes.innerHTML.replace(/\n\s+/g,'\n'));
			}

			if (nextSlideId) {

				var next = document.getElementById(nextSlideId).querySelector('h2');

				if (next) {
					next = next.innerHTML.replace(/^\s+|<[^>]+>/g,'');
					console.info('NEXT: ' + next);
				}
			}
		}
	};

	/**
	* Get slide hash.
	* @param {Number} slideNumber slide number (sic!). Attention: starts from zero.
	* @returns {String}
	*/
	shower.getSlideHash = function(slideNumber) {
		if ( ! shower._isNumber(slideNumber)) {
			throw new Error('Gimme slide number as Number, baby!');
		}

		slideNumber = shower._normalizeSlideNumber(slideNumber);

		return '#' + slideList[slideNumber].id;
	};

	/**
	* Run slide show if presented.
	* @param {Number} slideNumber
	* @returns {Boolean}
	*/
	shower.runInnerNavigation = function(slideNumber) {
		if ( ! shower._isNumber(slideNumber)) {
			throw new Error('Gimme slide number as Number, baby!');
		}

		slideNumber = shower._normalizeSlideNumber(slideNumber);

		clearTimeout(timer);

		if (slideList[slideNumber].hasTiming) {
			// Compute number of milliseconds from format "X:Y", where X is
			// number of minutes, and Y is number of seconds
			var timing = shower._getData(document.getElementById(slideList[slideNumber].id), 'timing').split(':');
			timing = parseInt(timing[0], 10) * 60 * 1000 + parseInt(timing[1], 10) * 1000;

			timer = setTimeout(function() {
					shower.next();
				},
				timing);
		}

		return true;
	};

	/**
	* Increases inner navigation by adding 'active' class to next inactive inner navigation item
	* @param {Number} slideNumber
	* @returns {Boolean}
	*/
	shower.increaseInnerNavigation = function(slideNumber) {
		var nextNodes,
			node;

		if ( ! shower._isNumber(slideNumber)) {
			throw new Error('Gimme slide number as Number, baby!');
		}

		// If inner navigation in this slide
		if (slideList[slideNumber].hasInnerNavigation) {
			nextNodes = document.getElementById(slideList[slideNumber].id).querySelectorAll('.next:not(.active)');

			if (0 !== nextNodes.length) {
				node = nextNodes[0];
				node.classList.add('active');
				return true;
			}
		}

		return false;
	};

	// Event handlers

	window.addEventListener('DOMContentLoaded', function() {
		if (body.classList.contains('full') || shower.isSlideMode()) {
			shower.go(shower.getCurrentSlideNumber());
			shower.enterSlideMode();
		}
	}, false);

	window.addEventListener('popstate', function() {
		if (shower.isListMode()) {
			shower.enterListMode();
		} else {
			shower.enterSlideMode();
		}
	}, false);

	window.addEventListener('resize', function() {
		if (shower.isSlideMode()) {
			shower._applyTransform(shower._getTransform());
		}
	}, false);

	document.addEventListener('keydown', function(e) {
		// Shortcut for alt, ctrl and meta keys
		if (e.altKey || e.ctrlKey || e.metaKey) { return; }

		var currentSlideNumber = shower.getCurrentSlideNumber(),
			isInnerNavCompleted = true;

		switch (e.which) {
			case 116: // F5
				e.preventDefault();

				if (shower.isListMode()) {
					var slideNumber = e.shiftKey ? currentSlideNumber : 0;

					// Warning: go must be before enterSlideMode.
					// Otherwise there is a bug in Chrome
					shower.go(slideNumber);
					shower.enterSlideMode();
					shower.showPresenterNotes(slideNumber);
				} else {
					shower.enterListMode();
				}
			break;

			case 13: // Enter
				if (shower.isListMode() && -1 !== currentSlideNumber) {
					e.preventDefault();
					shower.enterSlideMode();
					shower.showPresenterNotes(currentSlideNumber);
					shower.runInnerNavigation(currentSlideNumber);
				}
			break;

			case 27: // Esc
				if (shower.isSlideMode()) {
					e.preventDefault();
					shower.enterListMode();
				}
			break;

			case 8:  // Backspace
			case 33: // PgUp
			case 38: // Up
			case 37: // Left
			case 72: // H
			case 75: // K
				e.preventDefault();
				shower.previous();
			break;

			case 34: // PgDown
			case 40: // Down
			case 39: // Right
			case 76: // L
			case 74: // J
				e.preventDefault();
				shower.next();
			break;

			case 36: // Home
				e.preventDefault();
				shower.first();
			break;

			case 35: // End
				e.preventDefault();
				shower.last();
			break;

			case 9: // Tab = +1; Shift + Tab = -1
			case 32: // Space = +1; Shift + Space = -1
				e.preventDefault();
				shower[e.shiftKey ? 'previous' : 'next']();
			break;

			default:
				// Behave as usual
			break;
		}
	}, false);

	shower.init();

	document.addEventListener('click', function(e) {
		var slideNumber = shower.getSlideNumber(shower._getSlideIdByEl(e.target));

		// Click on slide in List mode
		if (shower.isListMode() && shower._getSlideIdByEl(e.target)) {
			// Warning: go must be before enterSlideMode.
			// Otherwise there is a bug in Chrome
			shower.go(slideNumber);
			shower.enterSlideMode();
			shower.showPresenterNotes(slideNumber);
		}
	}, false);

	document.addEventListener('touchstart', function(e) {
		if (shower._getSlideIdByEl(e.target)) {
			if (shower.isSlideMode() && ! shower._checkInteractiveElement(e)) {
				var x = e.touches[0].pageX;

				if (x > window.innerWidth / 2) {
					shower.next();
				} else {
					shower.previous();
				}
			}

			if (shower.isListMode()) {
				shower.go(shower.getSlideNumber(shower._getSlideIdByEl(e.target)));
				shower.enterSlideMode();
			}
		}

	}, false);

	document.addEventListener('touchmove', function(e) {
		if (shower.isSlideMode()) {
			e.preventDefault();
		}
	}, false);

	return shower;

})(this, this.document);
