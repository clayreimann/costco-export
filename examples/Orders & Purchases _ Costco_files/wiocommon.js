// eslint-disable-next-line no-var
var wioEventBus = {
  subscribers: {},
  subscribe(subscriptionKey, listener) {
    if (!this.subscribers[subscriptionKey]) {
      this.subscribers[subscriptionKey] = [];
    }
    const index = this.subscribers[subscriptionKey].push(listener) - 1;
    return {
      unSubscribe() {
        delete this.subscribers[subscriptionKey][index];
      }
    };
  },
  publish(subscriptionKey, data) {
    if (!this.subscribers[subscriptionKey] || this.subscribers[subscriptionKey].length < 1) return;
    this.subscribers[subscriptionKey].forEach((listener) => {
      listener(data || {});
    });
  }
};

var eventBus = {
		  subscribers: {},
		  subscribe(subscriptionKey, listener) {
		    if (!this.subscribers[subscriptionKey]) {
		      this.subscribers[subscriptionKey] = [];
		    }
		    const index = this.subscribers[subscriptionKey].push(listener) - 1;
		    return {
		      unSubscribe() {
		        delete this.subscribers[subscriptionKey][index];
		      }
		    };
		  },
		  publish(subscriptionKey, data) {
		    if (!this.subscribers[subscriptionKey] || this.subscribers[subscriptionKey].length < 1) return;
		    this.subscribers[subscriptionKey].forEach((listener) => {
		      listener(data || {});
		    });
		  }
		};


// wioEventBus.subscribe('getSubcategory', (data) => {
// 	data;
// });

window.eventBus.subscribe('popupShow', () => {
});


wioEventBus.subscribe('openWarehouseSideBar', () => {
  
});
window.wioEventBus.subscribe('bundleStateData', (data) => {
    if(data.loadingFlag){// disable swatch
        $(".RICHFXColorChangeLink").addClass('disabledSwatch');
        //$("#swatchesID-productOption00").attr('disabled', 'disabled');
    }else{
        $(".RICHFXColorChangeLink").removeClass('disabledSwatch');
        //$("#swatchesID-productOption00").removeAttr('disabled');
    }

});
window.wioEventBus.subscribe('bundleItemData', (data) => {
		var discount= data.totalDiscount;
		var isOutofstock = data.allOOS;
		var userInfo = COSTCO.util.getMemberCookie(), signedIn = userInfo.signedIn, costcoMember = userInfo.costcoMember != 'undefined' ? userInfo.costcoMember : false,
				memberOnly = $('#memberItem').val()=="true"? true:false; 
		
		catentryid = COSTCO.Product.active_catentry;
		if(typeof catentryid == 'undefined' && typeof data.catentryid !== 'undefined'){
			catentryid = data.catentryid
		}
	 	productOnlinePrice=data.totalPrice;
		$('.online-price').addClass('hide');
		$('.kb-OOS-price').addClass('hide');
		$('.kb-freightValue').addClass('hide');
		$('.kb-OOS-banner').addClass('hide');
		$('#breakdown').addClass('hide');
		$('#bundle-price-only').addClass('hide');
		$('#OosBanner span').remove();
		$('#a11y-your-price').addClass('hide');
		$('#pull-right-price').addClass('hide');
		var yourprice= 0.0;
		if( typeof productOnlinePrice !== 'undefined' && productOnlinePrice !== null && productOnlinePrice !== '' && !isNaN(productOnlinePrice) && productOnlinePrice !=0.0){
			yourprice=productOnlinePrice;
			$('.online-price[data-catentry='+catentryid+'] .op-value').text(COSTCO.Product.formatMoney(COSTCO.Product.processPrice(productOnlinePrice)));
			$('.online-price[data-catentry='+catentryid+']').data('opvalue', COSTCO.util.encode(productOnlinePrice+''));
			$('.online-price[data-catentry='+catentryid+']').removeClass('hide');
			if(!isOutofstock && typeof data.oosItemsPrice !== 'undefined' && data.oosItemsPrice !== null && data.oosItemsPrice !== '' && !isNaN(data.oosItemsPrice) && data.oosItemsPrice != 0.0) {
				yourprice = yourprice-data.oosItemsPrice;
				$('.kb-OOS-price[data-catentry='+catentryid+']').toggleClass('hide active');
				$('.kb-OOS-price[data-catentry='+catentryid+'] .op-value').text(COSTCO.Product.formatMoney(COSTCO.Product.processPrice(data.oosItemsPrice)));
				$('.kb-OOS-price[data-catentry='+catentryid+']').data('opOOSValue', COSTCO.util.encode(data.oosItemsPrice+''));
				$('.kb-OOS-price[data-catentry='+catentryid+']').removeClass('hide');
				if (COSTCO.util.getLangId() === '-25') {
					$('.kb-OOS-price[data-catentry='+catentryid+'] .op-label').addClass('kbfrenchalign');
				}
			}
			if( typeof data.bundleFreightSaving !== 'undefined' && data.bundleFreightSaving !== null && data.bundleFreightSaving !== '' && !isNaN(data.bundleFreightSaving) && data.bundleFreightSaving != 0.0 ) {
				yourprice = yourprice-data.bundleFreightSaving;
				 $('.kb-freightValue[data-catentry='+catentryid+']').toggleClass('hide active');
				$('.kb-freightValue[data-catentry='+catentryid+'] .op-value').text(COSTCO.Product.formatMoney(COSTCO.Product.processPrice(data.bundleFreightSaving)));
				$('.kb-freightValue[data-catentry='+catentryid+']').data('freightValue', COSTCO.util.encode(data.bundleFreightSaving+''));
				$('.kb-freightValue[data-catentry='+catentryid+']').removeClass('hide');
			}
			if( !isOutofstock && typeof data.noOfOOSitems !== 'undefined' && data.noOfOOSitems !== null && data.noOfOOSitems !== '' && !isNaN(data.noOfOOSitems) && data.noOfOOSitems != 0.0 && !$("#OosBanner span").hasClass('bannerStoretext')){
				let result="";
				if(data.noOfOOSitems==1){
					result = messages.KB_BUNDLE_OOS_BANNER;
				}else{
					result = messages.KB_BUNDLE_OOS_MUL_BANNER.replace("{0}", data.noOfOOSitems);
				}
				$("#OosBanner").append("<span class=' my-paragraph-style'></span><span class='bannerStoretext'>"+result+'</span>');
				$('.kb-OOS-banner').removeClass('hide');
			}
		}
	
		if( isOutofstock && !$("#OosBanner span").hasClass('bannerStoretext')){
			$("#OosBanner").append("<span class=' my-paragraph-style'></span><span class='bannerStoretext'>"+messages.KB_BUNDLE_ALL_OOS_BANNER+'</span>');
			$('.kb-OOS-banner').removeClass('hide');
		}
		if(yourprice !=productOnlinePrice){
			
			if(typeof yourprice !== 'undefined' && !isNaN(yourprice) && yourprice != 0.0) {
				$("#pull-right-price .value").text(COSTCO.Product.formatMoney(COSTCO.Product.processPrice(yourprice)));
			}else{
				$("#pull-right-price .value").text(COSTCO.Product.formatMoney(COSTCO.Product.processPrice(data.totalPrice)));
			}
			$('#breakdown').removeClass('hide');
			$('.your-price').removeClass('hide');
			$('#pull-right-price').removeClass('hide');
			$('#a11y-your-price').removeClass('hide');
		}
		else{
			
			if( productOnlinePrice == 0.0) {
				$("#bundle-price-only .value").text("--");
			}else{
				$("#bundle-price-only .value").text(COSTCO.Product.formatMoney(COSTCO.Product.processPrice(data.totalPrice)));
			}
		
			$('#bundle-price-only').removeClass('hide');
		}
		
		var date = data.EDD;
		if(!isOutofstock && typeof date !== 'undefined' && date !== null && date !== '' && date !== 'Invalid Date') {
			date = date.split('T')[0];
			var dateToDisplay = COSTCO.Product.getDateFormattedToDisplay(date);
			document.getElementById('estimatedDeliveryDate').innerHTML = dateToDisplay;
			if(typeof dateToDisplay === 'undefined' || dateToDisplay === null || dateToDisplay === '' || dateToDisplay === 'Invalid Date') {
				$('#edd-msg-code-smallpack').removeClass('hide');
				$('#edd-date-msg').addClass('hide');
				$('#edd-outofstock').addClass('hide');
				}else {
					$('#edd-message-block').show();
					$('#edd-date-msg').removeClass('hide');
					$('#edd-msg-code-smallpack').addClass('hide');
					$('#edd-outofstock').addClass('hide');
					}
			}else if(isOutofstock && ((memberOnly && signedIn && costcoMember) || !memberOnly )){
				$('#edd-msg-code-smallpack').addClass('hide');
				$('#edd-outofstock').removeClass('hide');
				$('#edd-date-msg').addClass('hide');
			}else{
				$('#edd-msg-code-smallpack').removeClass('hide');
				$('#edd-date-msg').addClass('hide');
				$('#edd-outofstock').addClass('hide');
			}
		//image OOS
		if(isOutofstock  && ((memberOnly && signedIn && costcoMember) || !memberOnly )){
			$('.oos-overlay').removeClass('hide');
            $('#bundle-button').attr("disabled", true);
            $('#bundle-button').addClass('out-of-stock');
            $('#bundle-button').val(messages.ADDTOCART_OUTOFSTOCK);
		} else{
			$('.oos-overlay').addClass('hide');
			$('#bundle-button').attr("disabled", false);
            $('#bundle-button').removeClass('out-of-stock');
            $('#bundle-button').val(messages.PDP_REDESIGN_V2_BUILD_BUNDLE);
		}
		if(!memberOnly && signedIn ){
			$('.math-table').show();
		}
	 });

// listen to PLP swatch selection event from react component
wioEventBus.subscribe('notifySelectedSwatch', (data) => {
	COSTCO.swatches.variantSelection(data.productId, data.itemImage, data.preSelectedPDPUrl, data.preSelectedProductLogonFormURL, data.colorOutOfStock);
});

wioEventBus.subscribe('notifySwatchExistsAndMounted', () => {	
	$('.featured-product.slick-slide[aria-hidden="true"]').find("button[data-testid*='swatchTestId_']").attr({
		'tabindex': '-1'
	});

	$('.featured-product.slick-slide[aria-hidden="false"]').find("button[data-testid*='swatchTestId_']").attr({
		'tabindex': '0'
	});
});

wioEventBus.subscribe('notifyVaraintsChange', () => {
  console.log('notifyVaraintsChange');
});

window.wioEventBus.subscribe('showZipError', (data) => {
	
	if(typeof document.getElementById("isSetDeliveryInline") !== "undefined" && document.getElementById("isSetDeliveryInline") !== null) {
			 if (document.getElementById("isSetDeliveryInline").value=='true') {
				 $('div.error').empty();
				 $('div.error').append(messages.ERR_GROCERY_INVALID_ZIP);
				 $('div.error').css({'font-size': '14px'});
				 $('.form-control').attr('aria-invalid','true');
				 $('.form-control').addClass("error");
				 
		  }
		}
	
	if(typeof document.getElementById("isEDDNonNarvarFlow") !== "undefined" && document.getElementById("isEDDNonNarvarFlow") !== null) {
		 if (document.getElementById("isEDDNonNarvarFlow").value=='true') {
			 let errorContainer = $('#edd-form-block').find('.edd-error');
		        errorContainer.empty();
		        errorContainer.append(messages.ERR_INVALID_ZIP);
		        errorContainer.show();
		        $('#edd-form-block').removeClass('hide');
			 
		 }
	}
	if(typeof document.getElementById("scheduledDeliveryEnabled") !== "undefined" && document.getElementById("scheduledDeliveryEnabled") !== null) {
		 if (document.getElementById("scheduledDeliveryEnabled").value=='true') {
			 $('#deliveryFailMessage').removeClass('hide');
			 $('#zip-group').addClass('hide');
    		 $('#deliveryFailMessage').removeClass("warning").addClass("critical-notification");
    		 $('#geDeliveryFailMessageSpan').text(messages.ERR_GROCERY_INVALID_ZIP);
		 }
	}

	if(typeof document.getElementById("isEDDNarvarFlow") !== "undefined" && document.getElementById("isEDDNarvarFlow") !== null) {
		 if (document.getElementById("isEDDNarvarFlow").value=='true') {
			 $('div.error').empty();
			 $('div.error').append(messages.ERR_INVALID_ZIP_EDD);
	  			let inputContainer = $(element).find('.form-control');
	  			if(inputContainer){
	  				inputContainer.attr('aria-invalid','true');
	  				inputContainer.addClass("error");
	  			}
			 
	  }
	}
	
});


window.wioEventBus.subscribe('pickUpAddToCart', (data, textStatus, xhr) => {
	var form = $('#ProductForm');
	let isRelatedForm = false;
    var $form = $(form),
    	locale = COSTCO.util.getLocale(),
    	quantity,
    	quantity_text = messages.RWD_QUANTITY + ' ',
    	final_price = (locale=='en-US'||locale=='en-CA'?' $':'') + (isRelatedForm ? $form.find('.price').text().replace('$','') : 
    		(costcoStoreFeatures.WEBSITE_REDESIGN_V2_PDP_FEATURE_ENABLE ? $('#pull-right-price .value').text() : $('.your-price .value').text()) ) + (locale=='fr-CA'?' $':''),
        selected_products = [];
    var productIndex = 1;
    $form.find('.variantContainer').each(function(i, p) {
        var dropdowns = $(p).find('option:selected').map(function(){ return $(this).val(); }).get();
        var swatches = $(p).find('.selected').map(function(){ return $(this).attr('value'); }).get();
        var selectedVariants = dropdowns.concat(swatches);
        var selected_product = COSTCO.Product.findItem(products[i], selectedVariants);
        if (selected_product) {
            quantity = COSTCO.Product.item_type == 'bundle' 
                ? parseInt($(p).find('[id^=qty-input] input').val())
                : parseInt($('input[name=quantity]').val());
            selected_product.quantity = quantity_text + quantity
            selected_product.item_number = $('span.item-number').text() || '#'+selected_product.partNumber || ""
            selected_product.final_price = COSTCO.Product.item_type != 'bundle' ? final_price 
                    : $('.online-price[data-catentry='+selected_product.catentry+']').data('opvalue')
                        ? COSTCO.Product.formatMoney(mathtable.calculateYourPrice(selected_product.catentry, true), true) 
                        : ''
        }
        if (selected_product && quantity > 0) {
            selected_products = selected_products.concat(selected_product);
            productIndex++;
        }
    });
    if (COSTCO.Product.item_type == 'single') {
        var selected_product = COSTCO.Product.findItem(products[0], []);
    	var id = document.getElementsByClassName("MuiInputBase-input MuiInput-input css-mnn31");
        selected_product.quantity = quantity_text +id[0].value;
        selected_product.item_number = $('span.item-number').text();
        selected_product.final_price = final_price;
        selected_products = selected_products.concat(selected_product);
    }
    	
    if(null != data && data != undefined){
    	data.selected_products = selected_products;
    	data.form_id = $form.selector;
    	$('#isPickUpItem').val(data.pickUp);
    	$('#isSTWtem').val(data.isSTWPickUp);
    	$('#isMDOItem').val(data.mdoPickUp);
        if (COSTCO.AddToCart.product_form_done) COSTCO.AddToCart.product_form_done(data, textStatus, xhr);
    	if(COSTCO.util.isNdEnabled()){
    		var surcharge = data.surchargeAmount;
        	var thresholdAmount = data.thresholdAmount;
        	var shipmethodId = data.shipmethodId;                	 
    		$('#freeDeliveryOrderAmount').val(parseFloat(thresholdAmount));
    		$('#deliverySurcharge').val(parseFloat(surcharge));
    		COSTCO.Header.displayTooltip(shipmethodId);
    	}
    	if (data.multipleRestricted) {
    		$form.find('.product-notification').html('<span>' + data.multipleRestricted + '<span>').show();
    	}
        $('input[name="associatedParentIds"]').val(data.associatedParentIds);
        COSTCO.Header.refreshGroceryBanner();
        COSTCO.Header.miniShopCartRefresh();
        if($('#related-products-container:not(.hide)').find('div[name="RelatedProductFormDiv"]:not(.hide)').length > 0) {
        	var logDesc = $('#productDescriptions1').html();
        	var parser = new DOMParser();
        	var htmlDoc = parser.parseFromString(logDesc, 'text/html');
        	var scriptTags = htmlDoc.getElementsByTagName('script');
    		for (i=0;i<scriptTags.length; i++) {
    			var identifier = scriptTags[i].innerText;
    			var formIndx = i+1;
                if (identifier.includes("RelatedProductForm_"+formIndx)) {
                	$("#RelatedProductForm_"+formIndx).submit();
                }
            }
        }
        
    }else if (fail) {
    	COSTCO.AddToCart.product_form_fail(xhr, textStatus, errorThrown)
    }else if(always) {
    	COSTCO.AddToCart.product_form_always(data, textStatus, errorThrown);
    	COSTCO.Header.miniShopCartRefresh();
    }
});

window.wioEventBus.subscribe('generatePriceAdjustmentEmail', (data) => {
	data.selectedLineItemObj.imageUrl = encodeURIComponent(data.selectedLineItemObj.imageUrl);
	COSTCO.AjaxModular.ajax_update_state({
	        url: 'PriceAdjustmentProxyCmd',
	        method: 'POST',
	        dataType: 'json',
	        data: data,
	        scrollToError: false,
	        done: function done(data, textStatus, jqXHR, options) {          
	        }
	     });
});

window.wioEventBus.subscribe('bundleAddtoCartResponse', (data, textStatus, xhr) => {
	var form = $('#ProductForm');
	    let isRelatedForm = false;
		$('#reactkitsandbundle').val(false);
	    var $form = $(form),
	        locale = COSTCO.util.getLocale(),
	        quantity,
	        quantity_text = messages.RWD_QUANTITY + ' ',
			price_text = "$",
			item_text =  $('span.item-number-bundles').text().trim() + ' ',
	        selected_products = [],
	        selected_product=[];

	    var noOfItems=data.Number_of_items;
	
	    if( noOfItems!== 'undefined' && !isNaN(noOfItems)) {
		    for(var i=1;i<=noOfItems;i++){
			    var quantity= "quantity_"+i,
			     itemName   = "item_name_"+i,
			     itemNumber = "item_number_"+i,
			     price      = "price_"+i,
			     imgurl     = "image_url_"+i;
				 ItemUrl = "productUrl_"+i;
				 var f_price = COSTCO.Product.formatMoney(data[price],true);
				 f_price = (locale == 'fr-CA') ? f_price.replace("$"," $"):f_price;
			    const items = {
			            quantity: quantity_text + data[quantity],	            
			            item_number:item_text + data[itemNumber],
			            final_price:f_price,
			            img_url: data[imgurl],
						productName :data[itemName],
						productUrl :data[ItemUrl],
						
			          };
			    selected_product.push(items);
		    }
		    selected_products = selected_products.concat(selected_product);
	    }
	    if(null != data && data != undefined){
	        data.selected_products = selected_products;
	        data.form_id = $form.selector;
	        COSTCO.Header.refreshGroceryBanner();
	        COSTCO.Header.miniShopCartRefresh();
			$('#reactkitsandbundle').val(true);
	        if (COSTCO.AddToCart.product_form_done) COSTCO.AddToCart.product_form_done(data, textStatus, xhr);
	        if(COSTCO.util.isNdEnabled()){
	            var surcharge = data.surchargeAmount;
	            var thresholdAmount = data.thresholdAmount;
	            var shipmethodId = data.shipmethodId;                     
	            $('#freeDeliveryOrderAmount').val(parseFloat(thresholdAmount));
	            $('#deliverySurcharge').val(parseFloat(surcharge));
	            COSTCO.Header.displayTooltip(shipmethodId);
	        }
	        if (data.multipleRestricted) {
	            $form.find('.product-notification').html('<span>' + data.multipleRestricted + '<span>').show();
	        }
	        $('input[name="associatedParentIds"]').val(data.associatedParentIds); 
	        if($('#related-products-container:not(.hide)').find('div[name="RelatedProductFormDiv"]:not(.hide)').length > 0) {
	            var logDesc = $('#productDescriptions1').html();
	            var parser = new DOMParser();
	            var htmlDoc = parser.parseFromString(logDesc, 'text/html');
	            var scriptTags = htmlDoc.getElementsByTagName('script');
	            for (i=0;i<scriptTags.length; i++) {
	                var identifier = scriptTags[i].innerText;
	                var formIndx = i+1;
	                if (identifier.includes("RelatedProductForm_"+formIndx)) {
	                    $("#RelatedProductForm_"+formIndx).submit();
	                }
	            }
	        }

	    }else if (fail) {
	        COSTCO.AddToCart.product_form_fail(xhr, textStatus, errorThrown)
	    }else if(always) {
	        COSTCO.AddToCart.product_form_always(data, textStatus, errorThrown);
	        COSTCO.Header.miniShopCartRefresh();
	    }
	});
//Listen to react publish event after calling pickup api and invoke  ajaxprice call if bopim eligible and available 
window.wioEventBus.subscribe('pickupAPIResponse', (data) => {
	
	var isOutOfNetworkLocation = COSTCO.Product.checkifOutofNetworkLocation();
	var enableLtlPickupFlag = $('#isLtlFeatureFlagOn').val();
	var applType = $('#applicationType').val();
	
	if(enableLtlPickupFlag && isOutOfNetworkLocation && applType=='BC') {
		if(data != undefined && data.ltlPickUpInfo != undefined) {
			var bopimPickupAvailable = data.ltlPickUpInfo.buyable;
		}
		var catentryid = $('#catEntryId').val();
		var productId = $("input[name='productBeanId']").val();
		var isLtlITem = $('#isBOPIMItemForMemberInfo').val();
		var prodArray = [];
		prodArray[0]=productId;
		var ajaxgetinvResponse = {
				"productId":prodArray,
				"itemId":catentryid,
				"isLtlItem":isLtlITem
		}; 
		if( bopimPickupAvailable != undefined && bopimPickupAvailable && ajaxgetinvResponse.isLtlItem == 'true' && productId != undefined && catentryid != undefined){
			COSTCO.CMath.showContractSpecificData(ajaxgetinvResponse);
			$('#isPriceCallInvokedForPickup').val('true');
		} else {
			$('#isPriceCallInvokedForPickup').val('false');
		}
	}
});

$('.header-link').click(function() {
	$('#RICHFXViewerContainer___richfx_id_0').css({'z-index':0});
});
$('.MuiSvgIcon-root').click(function() {
	$('#RICHFXViewerContainer___richfx_id_0').css({'z-index': '2000',});
});

window.wioEventBus.subscribe('openAddMembershipPopUp', (data, textStatus, xhr) => {
	COSTCO.LinkMembership.openLinkMembershipModal();
});

