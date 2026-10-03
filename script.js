document.addEventListener("DOMContentLoaded", () => {
    // ----------------------------------------------------
    // 1. Mobile Menu Toggle
    // ----------------------------------------------------
    const menuOpenButton = document.querySelector('#menu-open-button');
    const menuCloseButton = document.querySelector('#menu-close-button');
    const navLinks = document.querySelectorAll('.nav-menu .nav-link');

    if (menuOpenButton) {
        menuOpenButton.addEventListener("click", () => {
            document.body.classList.toggle("show-mobile-menu");
        });
    }

    if (menuCloseButton) {
        menuCloseButton.addEventListener("click", () => {
            document.body.classList.remove("show-mobile-menu");
        });
    }

    navLinks.forEach(link => {
        link.addEventListener("click", () => {
            document.body.classList.remove("show-mobile-menu");
        });
    });

    // ----------------------------------------------------
    // 2. Hero Image 3D Parallax & Tilt Effect
    // ----------------------------------------------------
    const heroCard = document.querySelector('#hero-image-card');
    const heroImage = document.querySelector('.hero-image');

    if (heroCard && heroImage) {
        heroCard.addEventListener('mousemove', (e) => {
            const rect = heroCard.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((y - centerY) / centerY) * -15;
            const rotateY = ((x - centerX) / centerX) * 15;
            
            heroImage.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
        });

        heroCard.addEventListener('mouseleave', () => {
            heroImage.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        });
    }

    // ----------------------------------------------------
    // 3. Interactive Cart Drawer & Order System
    // ----------------------------------------------------
    const cartToggleBtn = document.querySelector('#cart-toggle-btn');
    const cartCloseBtn = document.querySelector('#cart-close-btn');
    const cartDrawer = document.querySelector('#cart-drawer');
    const cartDrawerOverlay = document.querySelector('.cart-drawer-overlay');
    const cartItemsContainer = document.querySelector('#cart-items-container');
    const cartTotalPriceEl = document.querySelector('#cart-total-price');
    const cartCountBadge = document.querySelector('.cart-count');
    const checkoutBtn = document.querySelector('#checkout-btn');

    let cart = [];

    function toggleCart(show) {
        if (show) {
            cartDrawer.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            cartDrawer.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    if (cartToggleBtn) cartToggleBtn.addEventListener('click', () => toggleCart(true));
    if (cartCloseBtn) cartCloseBtn.addEventListener('click', () => toggleCart(false));
    if (cartDrawerOverlay) cartDrawerOverlay.addEventListener('click', () => toggleCart(false));

    function addToCart(id, name, price, imageSrc) {
        const existingItem = cart.find(item => item.id === id);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({ id, name, price, imageSrc, quantity: 1 });
        }
        updateCartUI();
        showToast(`Added "${name}" to your cart!`, 'fa-cart-plus');
        
        // Bounce badge
        if (cartCountBadge) {
            cartCountBadge.style.transform = 'scale(1.4)';
            setTimeout(() => { cartCountBadge.style.transform = 'scale(1)'; }, 250);
        }
    }

    function updateCartUI() {
        const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        if (cartCountBadge) cartCountBadge.textContent = totalCount;
        if (cartTotalPriceEl) cartTotalPriceEl.textContent = `$${totalPrice.toFixed(2)}`;

        if (checkoutBtn) {
            checkoutBtn.disabled = cart.length === 0;
        }

        if (cartItemsContainer) {
            if (cart.length === 0) {
                cartItemsContainer.innerHTML = `
                    <div class="empty-cart-msg">
                        <i class="fa-solid fa-mug-saucer"></i>
                        <p>Your order basket is currently empty.</p>
                        <a href="#menu" class="button shop-now-btn">Browse Menu</a>
                    </div>
                `;
                const shopBtn = cartItemsContainer.querySelector('.shop-now-btn');
                if (shopBtn) {
                    shopBtn.addEventListener('click', () => toggleCart(false));
                }
            } else {
                cartItemsContainer.innerHTML = cart.map(item => `
                    <div class="cart-item-row" data-id="${item.id}">
                        <img src="${item.imageSrc}" alt="${item.name}" class="cart-item-img">
                        <div class="cart-item-info">
                            <h4 class="cart-item-title">${item.name}</h4>
                            <div class="cart-item-price">$${(item.price * item.quantity).toFixed(2)}</div>
                        </div>
                        <div class="cart-item-qty">
                            <button class="qty-btn minus-btn" aria-label="Decrease quantity">-</button>
                            <span>${item.quantity}</span>
                            <button class="qty-btn plus-btn" aria-label="Increase quantity">+</button>
                        </div>
                        <button class="cart-item-remove" aria-label="Remove item"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                `).join('');

                // Attach row event listeners
                cartItemsContainer.querySelectorAll('.cart-item-row').forEach(row => {
                    const id = row.dataset.id;
                    row.querySelector('.minus-btn').addEventListener('click', () => changeQty(id, -1));
                    row.querySelector('.plus-btn').addEventListener('click', () => changeQty(id, 1));
                    row.querySelector('.cart-item-remove').addEventListener('click', () => removeFromCart(id));
                });
            }
        }
    }

    function changeQty(id, delta) {
        const item = cart.find(item => item.id === id);
        if (item) {
            item.quantity += delta;
            if (item.quantity <= 0) {
                removeFromCart(id);
            } else {
                updateCartUI();
            }
        }
    }

    function removeFromCart(id) {
        const itemIndex = cart.findIndex(item => item.id === id);
        if (itemIndex > -1) {
            const removedName = cart[itemIndex].name;
            cart.splice(itemIndex, 1);
            updateCartUI();
            showToast(`Removed "${removedName}" from cart`, 'fa-trash-can');
        }
    }

    // Attach click listeners to Menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        const id = item.dataset.id;
        const name = item.dataset.name;
        const price = parseFloat(item.dataset.price);
        const imageSrc = item.querySelector('.menu-image').src;

        const addBtn = item.querySelector('.add-to-cart-btn');
        const quickAddBtn = item.querySelector('.quick-add-btn');

        if (addBtn) {
            addBtn.addEventListener('click', () => addToCart(id, name, price, imageSrc));
        }
        if (quickAddBtn) {
            quickAddBtn.addEventListener('click', () => addToCart(id, name, price, imageSrc));
        }
    });

    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (cart.length > 0) {
                showToast('🎉 Order placed successfully! Your coffee is on its way.', 'fa-circle-check');
                cart = [];
                updateCartUI();
                toggleCart(false);
            }
        });
    }

    // ----------------------------------------------------
    // 4. Testimonials Interactive Slider Carousel
    // ----------------------------------------------------
    const testimonialList = document.querySelector('.testimonial-list');
    const testimonials = document.querySelectorAll('.testimonials-section .testimonial');
    const prevBtn = document.querySelector('.slider-btn.prev-btn');
    const nextBtn = document.querySelector('.slider-btn.next-btn');
    const dots = document.querySelectorAll('.slider-dots .dot');

    let currentSlide = 0;
    const totalSlides = testimonials.length;
    let autoSlideInterval;

    function goToSlide(index) {
        if (index < 0) currentSlide = totalSlides - 1;
        else if (index >= totalSlides) currentSlide = 0;
        else currentSlide = index;

        if (testimonialList) {
            testimonialList.style.transform = `translateX(-${currentSlide * 100}%)`;
        }

        dots.forEach((dot, idx) => {
            dot.classList.toggle('active', idx === currentSlide);
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            goToSlide(currentSlide - 1);
            resetAutoSlide();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            goToSlide(currentSlide + 1);
            resetAutoSlide();
        });
    }

    dots.forEach(dot => {
        dot.addEventListener('click', (e) => {
            const slideIdx = parseInt(e.target.dataset.index);
            goToSlide(slideIdx);
            resetAutoSlide();
        });
    });

    function startAutoSlide() {
        autoSlideInterval = setInterval(() => {
            goToSlide(currentSlide + 1);
        }, 5000);
    }

    function resetAutoSlide() {
        clearInterval(autoSlideInterval);
        startAutoSlide();
    }

    const sliderContainer = document.querySelector('.slider-container');
    if (sliderContainer) {
        sliderContainer.addEventListener('mouseenter', () => clearInterval(autoSlideInterval));
        sliderContainer.addEventListener('mouseleave', () => startAutoSlide());
    }

    startAutoSlide();

    // ----------------------------------------------------
    // 5. Gallery Category Filter & Lightbox
    // ----------------------------------------------------
    const filterBtns = document.querySelectorAll('.filter-btn');
    const galleryItems = document.querySelectorAll('.gallery-item');
    const lightboxModal = document.querySelector('#lightbox-modal');
    const lightboxImg = document.querySelector('#lightbox-img');
    const lightboxCaption = document.querySelector('#lightbox-caption');
    const lightboxClose = document.querySelector('.lightbox-close');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.dataset.filter;

            galleryItems.forEach(item => {
                const category = item.dataset.category;
                if (filter === 'all' || filter === category) {
                    item.style.display = 'block';
                    item.style.animation = 'zoomIn 0.4s ease';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });

    galleryItems.forEach(item => {
        item.addEventListener('click', () => {
            const imgSrc = item.querySelector('.gallery-img').src;
            const title = item.dataset.title || item.querySelector('.gallery-img').alt;

            if (lightboxModal && lightboxImg && lightboxCaption) {
                lightboxImg.src = imgSrc;
                lightboxCaption.textContent = title;
                lightboxModal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
            }
        });
    });

    function closeLightbox() {
        if (lightboxModal) {
            lightboxModal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
    if (lightboxModal) {
        lightboxModal.addEventListener('click', (e) => {
            if (e.target === lightboxModal) closeLightbox();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeLightbox();
            toggleCart(false);
        }
    });

    // ----------------------------------------------------
    // 6. Header Scroll & Active Nav Highlighting
    // ----------------------------------------------------
    const header = document.querySelector('header');
    const backToTopBtn = document.querySelector('#back-to-top');
    const sections = document.querySelectorAll('section[id]');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        if (window.scrollY > 400) {
            if (backToTopBtn) backToTopBtn.classList.add('show');
        } else {
            if (backToTopBtn) backToTopBtn.classList.remove('show');
        }

        // Active Section ScrollSpy
        let scrollY = window.pageYOffset;
        sections.forEach(current => {
            const sectionHeight = current.offsetHeight;
            const sectionTop = current.offsetTop - 120;
            const sectionId = current.getAttribute('id');

            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                document.querySelectorAll('.nav-menu a[href*=' + sectionId + ']').forEach(a => {
                    a.classList.add('active');
                });
            } else {
                document.querySelectorAll('.nav-menu a[href*=' + sectionId + ']').forEach(a => {
                    a.classList.remove('active');
                });
            }
        });
    });

    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ----------------------------------------------------
    // 7. Form Handlers & Toast Notification Helper
    // ----------------------------------------------------
    const contactForm = document.querySelector('#contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Thank you! Your message has been sent.', 'fa-paper-plane');
            contactForm.reset();
        });
    }

    const newsletterForm = document.querySelector('#newsletter-form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Subscribed! Check your inbox for coffee perks.', 'fa-envelope-open-text');
            newsletterForm.reset();
        });
    }

    function showToast(message, iconClass = 'fa-info-circle') {
        const toastContainer = document.querySelector('#toast-container');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <i class="fa-solid ${iconClass}"></i>
            <span>${message}</span>
        `;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
});