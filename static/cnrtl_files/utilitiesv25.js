	var	req = null;
	var PORTAIL_URI = '/portail/';
	var	PORTAIL_ACTION = {"morphologie":"/morphologie/","lexicographie":"/lexicographie/","etymologie":"/etymologie/","synonymie":"/synonymie/","antonymie":"/antonymie/","proxémie":"/proxemie/","concordance":"/concordance/"};
	var tooltip_url = null;
	var tooltip_content = "";	
	var avx = ['MSXML2.XMLHTTP.5.0','MSXML2.XMLHTTP.4.0','MSXML2.XMLHTTP.3.0','MSXML2.XMLHTTP','Microsoft.XMLHTTP'];
	var tlf_classes = [null,'.tlf_cauteur','.tlf_ccode','.tlf_cconstruction','.tlf_ccrochet','.tlf_cdate','.tlf_cdefinition','.tlf_cdomaine','.tlf_cvedette','.tlf_cexemple','.tlf_cemploi','.tlf_cmot','.tlf_cplan','.tlf_cpublication','.tlf_csource','.tlf_csynonime','.tlf_csyntagme','.tlf_ctitre'];
	var tlf_colors = [['#FF9090',0,'tlf.color0'],['#C0FFC0',16,'tlf.color1'],['#D0D0FF',0,'tlf.color2'],['#FFFF00',6,'tlf.color3'],['#FFB060',7,'tlf.color4'],['#00FFFF',0,'tlf.color5']];
	var	tlf_fonts = ['arial','verdana','helvetica','times','times new roman'];
	var version = 'v23';
	
	function installSearchEngine()
	{
		if (window.external && ("AddSearchProvider" in window.external))
		{
			window.external.AddSearchProvider("http://www.cnrtl.fr/portail/opensearch.xml");
		}
		else if (window.sidebar && ("addSearchEngine" in window.sidebar))
		{
			window.sidebar.addSearchEngine("http://www.cnrtl.fr/portail/opensearch.src","http://www.cnrtl.fr/portail/opensearch.png","Portail Lexical - CNRTL", "Recherche lexicographique dans le TLFi");
		}
		else
		{
			alert("Votre navigateur ne supporte pas cette fonctionnalité !!!!");
		}
	}

	function initPortail()
	{
		initOthers();
	}

	function initOthers()
	{
		initCookies();
		initDeferredTasks();
		setFocus('query');	
		initScroll();
	}

	function initScroll()
	{
		var elem;
		
		elem = document.getElementById('contentbox');
		if (elem != null) elem.ondblclick = showNavigationMenu;

		elem = document.getElementById('scrollart');
		if (elem != null)
		{
			elem = document.getElementById(elem.value);
			if (elem != null) elem.scrollIntoView(true);
		}
	}

	function initDeferredTasks()
	{
		var elem;
		
		elem = document.getElementById('loadprox');
		if (elem != null) elem.submit();
		
		elem = document.getElementById('loadbdlp');
		if (elem != null) loadAjaxQuery('/utilities/BDLP?query=',elem);

		elem = document.getElementById('loaddmf');
		if (elem != null) loadAjaxQuery('/utilities/ADMF?query=',elem);

		elem = document.getElementById('loadducange');
		if (elem != null) loadAjaxQuery('/utilities/DUCA?query=',elem);
	}

	function	initCookies()
	{
		var	div;
		var	value;

		value = getCookie('tlf.fontsize');
		setFontSize('contentbox',value);

		value = getCookie('tlf.fontname');
		setFontName('lexicontent',value);

		value = getCookie('tlf.highlight');
		if (value == 'true' || value == null)
		{
			for (x in tlf_colors)
			{
				value = getCookie(tlf_colors[x][2]);
				if (value != null) tlf_colors[x][1] = parseInt(value);
			}
	
			setHighlight(true);
		}
	}

	function setFontName(name,value)
	{
		var	div;

		div = document.getElementById(name);
		if (div != null)
		{
			value = (value == null) ? 0 : eval(value);
			div.style.fontFamily = tlf_fonts[value];
		}
	}

	function setFontSize(name,value)
	{
		var	div;

		div = document.getElementById(name);
		if (div != null)
		{
			value = (value == null) ? 1.0 : eval(value);
			div.style.fontSize = '' + value + 'em';
		}
	}

	function setHighlight(display)
	{
		var	color;
		
		for (x in tlf_colors)
		{
			if (tlf_colors[x][1] > 0)
			{
				color = (display == true) ? tlf_colors[x][0] : '';
				changeCSS(tlf_classes[tlf_colors[x][1]],'backgroundColor',color);
			}
		}
	}

	function changeFontName(value)
	{
		setCookie('tlf.fontname',value);
		setFontName('lexicontent',value);
	}

	function changeHighlight(checked)
	{
		setCookie('tlf.highlight',checked);
		setHighlight(checked);
	}

	function changeFontSize(add)
	{
		var	div;
		var	value;

		value = getCookie('tlf.fontsize');
		value = (value == null) ? 1.0 : eval(value);
		value += add;

		setCookie('tlf.fontsize',value);		
		setFontSize('contentbox',value);		
	}

	function changeColor(index,select)
	{
		var	newclass = select.selectedIndex;
		var oldclass = tlf_colors[index][1];

		for (x in tlf_colors)
		{
			if (x != index && newclass > 0 && tlf_colors[x][1] == newclass)
			{
				tlf_colors[x][1] = 0;
				setCookie(tlf_colors[x][2],0);
				document.optionBoxForm[tlf_colors[x][2]].selectedIndex = 0;
			}
		}
				
		if (oldclass > 0) changeCSS(tlf_classes[oldclass],'backgroundColor','');
		if (newclass > 0) changeCSS(tlf_classes[newclass],'backgroundColor',tlf_colors[index][0]);

		setCookie(tlf_colors[index][2],newclass);
		tlf_colors[index][1] = newclass;
	}

	function displayOptionBox(parent)
	{
		var	div,value,checked;

		value = getCookie('tlf.highlight');
		checked = (value == 'true' || value == null) ? true : false;
		document.getElementById('tlf.highlight').checked = checked;

		value = getCookie('tlf.fontname');
		value = (value == null) ? 0 : eval(value);
		div = document.getElementById('tlf.fontname').options.selectedIndex=value;

		for (x in tlf_colors)
		{
			value = tlf_colors[x][1];
			if (value > 0) document.optionBoxForm[tlf_colors[x][2]].options[value].selected = true;
		}
		
		div = document.getElementById('optionBox');
		if (div != null)
		{
			div.style.top = (getoffsetTop(parent)+18)+"px";
			div.style.left = (getoffsetLeft(parent)-40)+"px";
			div.style.display = "block";
		}
		
		return false;
	}

	function hideOptionBox()
	{
		var	div;
		
		div = document.getElementById('optionBox');
		div.style.display = "none";
		return false;
	}
	
	function changeCSS(theClass,element,value)
	{
		var		nbsheets,sheet,rules;
		
		nbsheets = document.styleSheets.length;
		for (var S = 0; S < nbsheets; S++)
		{
			rules = document.styleSheets[S].rules;
			if (rules == null) rules = document.styleSheets[S].cssRules;
			if (rules != null) for (var R = 0; R < rules.length; R++) if (rules[R].selectorText == theClass) rules[R].style[element] = value;
		}	
	}
	
	function getoffsetLeft(element)
	{
		if (!element) return 0;
		return element.offsetLeft + getoffsetLeft(element.offsetParent);
	}
	
	function getoffsetTop(element)
	{
		if (!element) return 0;
		return element.offsetTop + getoffsetTop(element.offsetParent);
	}

	function setCookie(name, value)
	{
		var	curCookie = name + '=' + escape(value) + '; expires=Thu, 31 Dec 2099 23:59:59 GMT; path=/';
		document.cookie = curCookie;
	}

	function getCookie(name)
	{
		var dc = document.cookie;
		var prefix = name + "=";
		var begin = dc.indexOf(prefix);

		if (begin == -1) return null;
		var end = document.cookie.indexOf(";", begin);
		if (end == -1) end = dc.length;
		return unescape(dc.substring(begin + prefix.length, end));
	}

	function deleteCookie(name, path, domain)
	{
		if (getCookie(name))
		{
			document.cookie = name + '=' + ((path) ? '; path=' + path : '') + ((domain) ? '; domain=' + domain : '') + '; expires=Thu, 01-Jan-70 00:00:01 GMT';
		}
	}

	function showAjaxTooltip(url)
	{
		if (url == tooltip_url) showOverlib();
		else
		{
			tooltip_url = url;
			tooltip_content = "";
			loadXMLRequest(url,tooltipCallback);
		}

		return true;	
	}
	
	function hideAjaxTooltip()
	{
		return nd();
	}
	
	function tooltipCallback()
	{
		if (req && req.readyState == 4)
		{
			if (req.status == 200)
			{
				tooltip_content = req.responseText;
				showOverlib();
			}
		}
	}

	function showOverlib()
	{
		overlib_pagedefaults(CLOSETEXT,'Fermer');
		overlib(tooltip_content,STICKY,CAPTION,'Informations',CENTER);
	}

	function showNavigationMenu(e) 
	{
		var range,par,str="";
		
		if (navigator.appVersion.indexOf('Safari')!=-1) str = "" + parent.getSelection();
		else
		{
			doc = parent.document;
			if (doc.getSelection) str = doc.getSelection();
			else if (doc.selection && doc.selection.createRange)
			{
				range = doc.selection.createRange();
				if (range.text == "") return;
				range.expand("word");
				par = range.parentElement();
				str = range.text;
			}
		}
		
		if (str.length > 26) str = str.substring(0,26);
		if (str.charAt(str.length-1) == " ") str = str.substring(0,str.length-1);
		if (str != "")
		{
			k = str.indexOf("'");
			if (k != -1) str = str.substring(k+1,str.length);
		}

		if (str != "")
		{
			var titre = "Chercher '" + str+ "' en:";
			var content = '<div align="left"><ul>';
			for (var name in PORTAIL_ACTION) content += '<li><a href="' + PORTAIL_ACTION[name] + str + '">' + name + '</a></li>';
			content += "</ul></div>";
			overlib_pagedefaults(CLOSETEXT,'Fermer');
			overlib(content,STICKY,CAPTION,titre,CENTER);
		}
	}

	function getValue(name)
	{
		var node;
								
		node = document.getElementById(name);
		return ((node != null) ? node.value : null);
	}

	function setValue(name,value)
	{
		var node;
								
		node = document.getElementById(name);
		if (node != null) node.value = value;
	}

	function setFocus(name)
	{
		var	node;
		
		node = document.getElementById(name);
		if (node != null) node.focus();
	}
	
	function loadXMLRequest(url,callback)
	{
		try
		{
			req = null;
			req = new XMLHttpRequest();
		}
		catch (e)
		{
			for (var i=0;i<avx.length;i++)
			{
				try
				{
					req = new ActiveXObject(avx[i]);
					break;
				}
				catch (e) {}
			}
		}
		
		if (req)
		{
			req.open("GET",url,true);
			req.onreadystatechange = callback;
			req.send(null);
		}
	}

	function ajaxCallback()
	{
		if (req && req.readyState == 4)
		{
			str = (req.status == 200) ? req.responseText : '';
			document.getElementById('content').innerHTML = str;
			initOthers();
		}
	}

	function sendRequest(flag,url)
	{
		var		value,fsyn,fnew,fraw;
		
		fsyn = (flag & 1);
		fnew = (flag & 2);
		fraw = (flag & 4);

		if (!fraw)
		{
			value = getValue('query');
			if (value != null)
			{
				if (fnew && value == '') return (false);
				
				url += value;
	
				value = getValue('category');
				if (value != null && value != '') url += '/' + value;
			}
		}
		
		if (!fsyn) window.location.href = url;
		else
		{
			url += '?ajax=true';
			loadXMLRequest(url,ajaxCallback);
		}
		
		return (false);
	}

	function playSound(url)
	{
		var		element;

		element = document.getElementById('soundspan');
		if (element != null) 
		{
			if (navigator.appVersion.indexOf("Macintosh") != -1 || navigator.appVersion.indexOf("X11") != -1)
			{
				element.innerHTML = '<object type="audio/basic" data="'+url+'" width="0" height="0"><param name="src" value="'+url+'" /><param name="autoplay" value="true" /><param name="autoStart" value="0" /></object>';
			}
			else
			{	
				if (navigator.appVersion.indexOf("MSIE") != -1) element.innerHTML = '<object id="WMP" width="0" height="0" classid="CLSID:6BF52A52-394A-11d3-B153-00C04F79FAA6" type="application/x-oleobject"><param name="url" value="'+url+'"><param name="autostart" value="1" /><param name="showcontrols" value="0" /><param name="showdisplay" value="0" /><param name="showstatusbar" value="0" /><param name="loop" value="0" /></object>';
				else element.innerHTML = '<object id="WMP" type="application/x-ms-wmp"><param name="url" value="'+url+'"><param name="autostart" value="1" /><param name="uimode" value="0" /><param name="loop" value="0" /></object>';
			}
		}
	}

	function loadAjaxQuery(query,elem)
	{
		loadXMLRequest(query+elem.value,ajaxQueryCallback);		
	}
	
	function ajaxQueryCallback()
	{
		if (req && req.readyState == 4)
		{
			str = (req.status == 200) ? req.responseText : '';
			document.getElementById('contentbox').innerHTML = str;
		}
	}

	function loadDMFQuery(elem)
	{
		loadXMLRequest('/utilities/BDLP?query='+elem.value,bdlpCallback);		
	}
	
	function bdlpCallback()
	{
		if (req && req.readyState == 4)
		{
			str = (req.status == 200) ? req.responseText : '';
			document.getElementById('contentbox').innerHTML = str;
		}
	}

	function printPage()
	{
		var		a,d,x;
		
		a = window.open("","","scrollbars=yes,toolbar=no,resizable=yes,status=yes,width=800,height=400");
		x = a.document;
		
		x.open("text/html");
		x.write('<html><head><meta http-equiv="content-language" content="fr" /><meta http-equiv="content-type" content="text/html; charset=utf-8" />');
		x.write('<link type="text/css" rel="stylesheet" media="all" href="/css/portail'+version+'.css" />');
		x.write('<title>Portail lexical</title></head><body onload="initPortail();"><div id="wrap"><div id="main_content">');

		d = document.getElementById("optionBox");
		if (d != null)
		{
			x.write('<div id="optionBox">');
			x.write(d.innerHTML);
			x.write('</div>');
		}

		d = document.getElementById("contentbox");
		if (d != null)
		{
			x.write('<div id="contentbox">');
			x.write(d.innerHTML);
			x.write('</div>');
		}
		
		x.write('</div></div><script type="text/javascript" src="/js/utilities'+version+'.js"></script></body></html>');
		x.close();
		a.print();
		a.close();
	}
	
