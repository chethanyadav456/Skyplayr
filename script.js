const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');
const header = document.querySelector('.site-header');

if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
    });
  });
}

const revealElements = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.2,
      rootMargin: '0px 0px -40px 0px'
    }
  );

  revealElements.forEach((el) => observer.observe(el));
} else {
  revealElements.forEach((el) => el.classList.add('is-visible'));
}

const onScroll = () => {
  if (!header) {
    return;
  }
  header.classList.toggle('is-scrolled', window.scrollY > 24);
};

window.addEventListener('scroll', onScroll, { passive: true });
onScroll();