import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-reference-placeholder-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './reference-placeholder-page.component.html',
  styleUrl: './reference-placeholder-page.component.scss',
})
export class ReferencePlaceholderPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  readonly pageTitle = String(this.route.snapshot.data['pageTitle'] ?? 'Reference Page');

  ngOnInit(): void {
    this.title.setTitle(`FSB - ${this.pageTitle}`);
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.meta.updateTag({
      name: 'description',
      content: `${this.pageTitle} is queued for the next FSB Showcase page-by-page rebuild.`,
    });
  }

  ngOnDestroy(): void {
    this.meta.removeTag('name="robots"');
  }
}
